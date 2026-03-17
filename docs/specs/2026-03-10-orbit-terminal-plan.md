# Orbit Terminal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native macOS app that bundles a forked Ghostty terminal with SwiftUI sidebars, auto-launching the `orbit` CLI as the primary experience.

**Architecture:** Fork Ghostty's macOS app (`macos/`). Wrap the existing SwiftUI TerminalView in an HStack with a left sidebar (sessions + file tree) and right sidebar (file preview + diffs). SwiftUI sidebars communicate with the OpenCode process via its existing HTTP+SSE server on localhost:4096. libghostty stays untouched.

**Tech Stack:** Swift/SwiftUI/AppKit, libghostty (Zig, untouched), Ghostty Xcode project, URLSession + EventSource for HTTP+SSE

**Spec:** `docs/specs/2026-03-10-orbit-terminal-design.md`

**Source Repos:**

- Ghostty fork: `reference/ghostty/` (to be forked into its own repo)
- OpenCode CLI: `Agent-backend/packages/opencode/`

---

## File Structure

### New Files (to create inside `reference/ghostty/macos/Sources/`)

```
Features/Sidebar/
├── SidebarContainerView.swift       # HStack wrapper: left + terminal + right
├── LeftSidebar/
│   ├── LeftSidebarView.swift        # Tab container (Sessions | Files)
│   ├── SessionsListView.swift       # Session list from API
│   ├── SessionRowView.swift         # Single session row
│   ├── FileTreeView.swift           # File tree from API
│   └── FileTreeNodeView.swift       # Single file/folder row
├── RightSidebar/
│   ├── RightSidebarView.swift       # Contextual container (preview | diff)
│   ├── FilePreviewView.swift        # Syntax-highlighted code preview
│   └── DiffView.swift               # Unified diff view (green/red)
└── Shared/
    ├── SidebarState.swift           # ObservableObject for sidebar state
    ├── SidebarResizeHandle.swift    # Drag handle for resizing
    └── OrbitAPIClient.swift         # HTTP+SSE client for localhost:4096
```

### Existing Files to Modify

| File                                                           | Change                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `macos/Sources/Features/Terminal/TerminalView.swift`           | Wrap content in `SidebarContainerView`                              |
| `macos/Sources/Features/Terminal/BaseTerminalController.swift` | Add sidebar state management, persist sidebar width                 |
| `macos/Sources/App/macOS/AppDelegate.swift`                    | Set `SurfaceConfiguration.initialInput = "orbit\n"` for auto-launch |
| `macos/Sources/Ghostty/Ghostty.SurfaceConfiguration.swift`     | Verify initialInput/command support                                 |
| `macos/Ghostty.xcodeproj`                                      | Add new Swift files to build target                                 |
| Various asset files                                            | Rebrand to "Orbit Terminal"                                         |

---

## Chunk 1: Fork, Rebrand, and Auto-Launch

### Task 1: Verify Ghostty Builds Locally

**Files:**

- Read: `reference/ghostty/README.md`
- Read: `reference/ghostty/macos/Ghostty.xcodeproj/`

- [ ] **Step 1: Read Ghostty build prerequisites**

Check README for required Zig version, Xcode version, and build steps.

- [ ] **Step 2: Build libghostty**

Run:

```bash
cd reference/ghostty
zig build
```

Expected: Successful build of libghostty framework

- [ ] **Step 3: Open and build Xcode project**

Run:

```bash
open reference/ghostty/macos/Ghostty.xcodeproj
```

Then build (Cmd+B) in Xcode. Expected: Ghostty.app builds successfully.

- [ ] **Step 4: Run Ghostty to verify it works**

Run the built app. Expected: A working terminal window opens.

- [ ] **Step 5: Commit baseline**

```bash
cd reference/ghostty
git checkout -b orbit-terminal
git add -A
git commit -m "chore: baseline ghostty fork for orbit terminal"
```

---

### Task 2: Auto-Launch `orbit` CLI in Terminal

**Files:**

- Modify: `macos/Sources/App/macOS/AppDelegate.swift`
- Read: `macos/Sources/Ghostty/Ghostty.SurfaceConfiguration.swift`

- [ ] **Step 1: Read SurfaceConfiguration to understand initialInput**

Read `Ghostty.SurfaceConfiguration.swift` to confirm how `initialInput` works. This is the mechanism to send text to the PTY on launch.

- [ ] **Step 2: Read AppDelegate.swift to find window creation**

Find the `newWindow()` method and understand how `SurfaceConfiguration` is passed to `TerminalController`.

- [ ] **Step 3: Modify AppDelegate to set initialInput**

In `AppDelegate.swift`, where new terminal windows are created, set:

```swift
var config = Ghostty.SurfaceConfiguration()
config.initialInput = "orbit\n"
```

This sends `orbit` + Enter to the shell immediately after the terminal opens.

- [ ] **Step 4: Build and test**

Build in Xcode, run. Expected: Terminal opens and immediately runs `orbit`, showing the OpenCode TUI.

- [ ] **Step 5: Commit**

```bash
git add macos/Sources/App/macOS/AppDelegate.swift
git commit -m "feat: auto-launch orbit CLI on terminal open"
```

---

### Task 3: Rebrand to Orbit Terminal

**Files:**

- Modify: `macos/Ghostty.xcodeproj/project.pbxproj` (bundle ID, product name)
- Modify: `macos/Sources/App/macOS/AppDelegate.swift` (window title references)
- Modify: `macos/Assets.xcassets/` (app icon)
- Modify: `macos/Sources/App/macOS/MainMenu.xib` (menu bar text)

- [ ] **Step 1: Change bundle identifier**

In Xcode project settings, change:

- Bundle Identifier: `com.orbit.terminal`
- Product Name: `Orbit Terminal`
- Display Name: `Orbit Terminal`

- [ ] **Step 2: Update menu bar text**

In `MainMenu.xib`, replace "Ghostty" references with "Orbit Terminal" in menu titles.

- [ ] **Step 3: Update window title references in AppDelegate**

Search for "Ghostty" string references in `AppDelegate.swift` and update to "Orbit Terminal".

- [ ] **Step 4: Placeholder app icon**

Replace the Ghostty icon in `Assets.xcassets/AppIcon.appiconset/` with an Orbit Terminal placeholder icon.

- [ ] **Step 5: Build and verify branding**

Build in Xcode, run. Expected: Menu bar says "Orbit Terminal", window title updated, About shows new name.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: rebrand ghostty to orbit terminal"
```

---

## Chunk 2: Sidebar Infrastructure

### Task 4: Create SidebarState (Observable State)

**Files:**

- Create: `macos/Sources/Features/Sidebar/Shared/SidebarState.swift`

- [ ] **Step 1: Create the Sidebar directory structure**

```bash
mkdir -p reference/ghostty/macos/Sources/Features/Sidebar/{LeftSidebar,RightSidebar,Shared}
```

- [ ] **Step 2: Write SidebarState**

```swift
import SwiftUI
import Combine

enum SidebarTab: String, CaseIterable {
    case sessions = "Sessions"
    case files = "Files"
}

@Observable
final class SidebarState {
    // Left sidebar
    var leftSidebarVisible: Bool = true
    var leftSidebarWidth: CGFloat = 240
    var activeLeftTab: SidebarTab = .sessions

    // Right sidebar
    var rightSidebarVisible: Bool = false
    var rightSidebarWidth: CGFloat = 320

    // Right sidebar content
    var previewFilePath: String? = nil
    var previewFileContent: String? = nil
    var diffContent: String? = nil
    var showDiff: Bool = false

    // Sidebar width constraints
    static let minSidebarWidth: CGFloat = 180
    static let maxSidebarWidth: CGFloat = 500

    func toggleLeftSidebar() {
        leftSidebarVisible.toggle()
    }

    func toggleRightSidebar() {
        rightSidebarVisible.toggle()
    }

    func showFilePreview(path: String, content: String) {
        previewFilePath = path
        previewFileContent = content
        showDiff = false
        rightSidebarVisible = true
    }

    func showFileDiff(path: String, diff: String) {
        previewFilePath = path
        diffContent = diff
        showDiff = true
        rightSidebarVisible = true
    }
}
```

- [ ] **Step 3: Add file to Xcode project**

Add `SidebarState.swift` to the Ghostty Xcode target.

- [ ] **Step 4: Build to verify compilation**

Build in Xcode. Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add SidebarState observable for sidebar management"
```

---

### Task 5: Create SidebarResizeHandle

**Files:**

- Create: `macos/Sources/Features/Sidebar/Shared/SidebarResizeHandle.swift`

- [ ] **Step 1: Write SidebarResizeHandle**

```swift
import SwiftUI

struct SidebarResizeHandle: View {
    @Binding var width: CGFloat
    let minWidth: CGFloat
    let maxWidth: CGFloat
    let edge: Edge  // .leading or .trailing

    @State private var isDragging = false

    var body: some View {
        Rectangle()
            .fill(isDragging ? Color.accentColor.opacity(0.5) : Color.clear)
            .frame(width: 4)
            .contentShape(Rectangle().size(width: 8, height: .infinity))
            .onHover { hovering in
                if hovering {
                    NSCursor.resizeLeftRight.push()
                } else {
                    NSCursor.pop()
                }
            }
            .gesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { value in
                        isDragging = true
                        let delta = edge == .trailing
                            ? value.translation.width
                            : -value.translation.width
                        let newWidth = max(minWidth, min(maxWidth, width + delta))
                        width = newWidth
                    }
                    .onEnded { _ in
                        isDragging = false
                    }
            )
    }
}

enum Edge {
    case leading, trailing
}
```

- [ ] **Step 2: Add to Xcode project and build**

Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add SidebarResizeHandle drag-to-resize component"
```

---

### Task 6: Create SidebarContainerView (Main Layout Wrapper)

**Files:**

- Create: `macos/Sources/Features/Sidebar/SidebarContainerView.swift`
- Modify: `macos/Sources/Features/Terminal/TerminalView.swift`

- [ ] **Step 1: Read current TerminalView.swift**

Read `macos/Sources/Features/Terminal/TerminalView.swift` to understand the existing view body. This is what we wrap.

- [ ] **Step 2: Write SidebarContainerView**

```swift
import SwiftUI

struct SidebarContainerView<Content: View>: View {
    @Bindable var sidebarState: SidebarState
    let content: Content

    init(sidebarState: SidebarState, @ViewBuilder content: () -> Content) {
        self.sidebarState = sidebarState
        self.content = content()
    }

    var body: some View {
        HStack(spacing: 0) {
            // Left sidebar
            if sidebarState.leftSidebarVisible {
                LeftSidebarView(sidebarState: sidebarState)
                    .frame(width: sidebarState.leftSidebarWidth)

                SidebarResizeHandle(
                    width: $sidebarState.leftSidebarWidth,
                    minWidth: SidebarState.minSidebarWidth,
                    maxWidth: SidebarState.maxSidebarWidth,
                    edge: .trailing
                )
            }

            // Center: terminal content (passed through)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Right sidebar
            if sidebarState.rightSidebarVisible {
                SidebarResizeHandle(
                    width: $sidebarState.rightSidebarWidth,
                    minWidth: SidebarState.minSidebarWidth,
                    maxWidth: SidebarState.maxSidebarWidth,
                    edge: .leading
                )

                RightSidebarView(sidebarState: sidebarState)
                    .frame(width: sidebarState.rightSidebarWidth)
            }
        }
    }
}
```

- [ ] **Step 3: Create stub LeftSidebarView**

Create `macos/Sources/Features/Sidebar/LeftSidebar/LeftSidebarView.swift`:

```swift
import SwiftUI

struct LeftSidebarView: View {
    @Bindable var sidebarState: SidebarState

    var body: some View {
        VStack(spacing: 0) {
            // Tab picker
            Picker("", selection: $sidebarState.activeLeftTab) {
                ForEach(SidebarTab.allCases, id: \.self) { tab in
                    Text(tab.rawValue).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .padding(8)

            Divider()

            // Tab content
            switch sidebarState.activeLeftTab {
            case .sessions:
                Text("Sessions")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .files:
                Text("Files")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(.ultraThinMaterial)
    }
}
```

- [ ] **Step 4: Create stub RightSidebarView**

Create `macos/Sources/Features/Sidebar/RightSidebar/RightSidebarView.swift`:

```swift
import SwiftUI

struct RightSidebarView: View {
    @Bindable var sidebarState: SidebarState

    var body: some View {
        VStack(spacing: 0) {
            if let path = sidebarState.previewFilePath {
                // Header with filename
                HStack {
                    Text(URL(fileURLWithPath: path).lastPathComponent)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    Button(action: { sidebarState.rightSidebarVisible = false }) {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.plain)
                }
                .padding(8)

                Divider()

                if sidebarState.showDiff {
                    Text("Diff View")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Text("File Preview")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            } else {
                Text("No file selected")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(.ultraThinMaterial)
    }
}
```

- [ ] **Step 5: Integrate SidebarContainerView into TerminalView**

Modify `TerminalView.swift` — wrap the existing ZStack body content:

```swift
// Before (existing):
var body: some View {
    ZStack {
        // ... existing terminal content
    }
}

// After (wrapped):
var body: some View {
    SidebarContainerView(sidebarState: sidebarState) {
        ZStack {
            // ... existing terminal content (unchanged)
        }
    }
}
```

Add `sidebarState` as a property on TerminalView:

```swift
@State private var sidebarState = SidebarState()
```

- [ ] **Step 6: Add all new files to Xcode project**

Add all new Swift files to the Ghostty Xcode target.

- [ ] **Step 7: Build and test**

Build in Xcode, run. Expected: Terminal opens with left sidebar visible (showing stub "Sessions"/"Files" tabs), center terminal running normally, right sidebar hidden by default.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add three-panel layout with sidebar container wrapping terminal"
```

---

## Chunk 3: IPC Layer (HTTP+SSE Client)

### Task 7: Create OrbitAPIClient

**Files:**

- Create: `macos/Sources/Features/Sidebar/Shared/OrbitAPIClient.swift`

- [ ] **Step 1: Write the API client**

```swift
import Foundation
import Combine

@Observable
final class OrbitAPIClient {
    private let baseURL: URL
    private let session: URLSession
    private var sseTask: URLSessionDataTask?

    // Published state from API
    var sessions: [OrbitSession] = []
    var isConnected: Bool = false

    init(port: Int = 4096) {
        self.baseURL = URL(string: "http://localhost:\(port)")!
        self.session = URLSession(configuration: .default)
    }

    // MARK: - Sessions

    func fetchSessions() async throws {
        let url = baseURL.appendingPathComponent("/session")
        let (data, _) = try await session.data(from: url)
        let response = try JSONDecoder().decode(SessionListResponse.self, from: data)
        await MainActor.run {
            self.sessions = response.sessions
        }
    }

    // MARK: - Files

    func readFile(path: String) async throws -> String {
        var components = URLComponents(url: baseURL.appendingPathComponent("/file/read"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "path", value: path)]
        let (data, _) = try await session.data(from: components.url!)
        let response = try JSONDecoder().decode(FileReadResponse.self, from: data)
        return response.content
    }

    // MARK: - SSE Connection

    func connectSSE() {
        let url = baseURL.appendingPathComponent("/stream")
        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = TimeInterval(Int.max)

        sseTask = session.dataTask(with: request)
        // SSE parsing handled in delegate
        sseTask?.resume()
        isConnected = true
    }

    func disconnect() {
        sseTask?.cancel()
        sseTask = nil
        isConnected = false
    }

    // MARK: - Connection Polling (retry until server is ready)

    func waitForServer(maxAttempts: Int = 30, interval: TimeInterval = 1.0) async -> Bool {
        for _ in 0..<maxAttempts {
            do {
                let url = baseURL.appendingPathComponent("/session")
                let (_, response) = try await session.data(from: url)
                if let httpResponse = response as? HTTPURLResponse,
                   httpResponse.statusCode == 200 {
                    await MainActor.run { self.isConnected = true }
                    return true
                }
            } catch {
                // Server not ready yet
            }
            try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
        }
        return false
    }
}

// MARK: - API Response Types

struct OrbitSession: Codable, Identifiable {
    let id: String
    let title: String?
    let createdAt: String?
    let model: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case createdAt = "created_at"
        case model
    }
}

struct SessionListResponse: Codable {
    let sessions: [OrbitSession]
}

struct FileReadResponse: Codable {
    let content: String
}
```

- [ ] **Step 2: Add to Xcode project and build**

Expected: Compiles with no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add OrbitAPIClient for HTTP+SSE communication with orbit server"
```

---

### Task 8: Wire API Client to Sidebar State

**Files:**

- Modify: `macos/Sources/Features/Sidebar/Shared/SidebarState.swift`
- Modify: `macos/Sources/Features/Terminal/TerminalView.swift`

- [ ] **Step 1: Add API client to SidebarState**

Add to `SidebarState.swift`:

```swift
@Observable
final class SidebarState {
    let apiClient = OrbitAPIClient()

    // ... existing properties ...

    func connectToOrbit() {
        Task {
            let connected = await apiClient.waitForServer()
            if connected {
                try? await apiClient.fetchSessions()
                apiClient.connectSSE()
            }
        }
    }
}
```

- [ ] **Step 2: Trigger connection on TerminalView appear**

In `TerminalView.swift`, add `.onAppear`:

```swift
SidebarContainerView(sidebarState: sidebarState) {
    ZStack { /* existing */ }
}
.onAppear {
    sidebarState.connectToOrbit()
}
```

- [ ] **Step 3: Build and test**

Build and run. The API client will try to connect to localhost:4096 once `orbit` starts in the terminal. Initially it may fail (orbit takes a moment to start) — the `waitForServer` retry loop handles this.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: wire OrbitAPIClient to sidebar state with auto-connect on launch"
```

---

## Chunk 4: Left Sidebar — Sessions & Files

### Task 9: Sessions List View

**Files:**

- Create: `macos/Sources/Features/Sidebar/LeftSidebar/SessionRowView.swift`
- Modify: `macos/Sources/Features/Sidebar/LeftSidebar/LeftSidebarView.swift`
- Create: `macos/Sources/Features/Sidebar/LeftSidebar/SessionsListView.swift`

- [ ] **Step 1: Write SessionRowView**

```swift
import SwiftUI

struct SessionRowView: View {
    let session: OrbitSession
    let isActive: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title ?? "Untitled")
                    .font(.system(size: 13, weight: isActive ? .semibold : .regular))
                    .lineLimit(1)

                if let model = session.model {
                    Text(model)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(isActive ? Color.accentColor.opacity(0.15) : Color.clear)
        .cornerRadius(6)
    }
}
```

- [ ] **Step 2: Write SessionsListView**

```swift
import SwiftUI

struct SessionsListView: View {
    @Bindable var sidebarState: SidebarState
    @State private var selectedSessionId: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 2) {
                ForEach(sidebarState.apiClient.sessions) { session in
                    SessionRowView(
                        session: session,
                        isActive: session.id == selectedSessionId
                    )
                    .onTapGesture {
                        selectedSessionId = session.id
                        // TODO: Send session switch command to orbit
                    }
                }
            }
            .padding(6)
        }
        .overlay {
            if sidebarState.apiClient.sessions.isEmpty {
                if sidebarState.apiClient.isConnected {
                    Text("No sessions yet")
                        .foregroundStyle(.secondary)
                } else {
                    ProgressView("Connecting...")
                        .font(.caption)
                }
            }
        }
    }
}
```

- [ ] **Step 3: Update LeftSidebarView to use SessionsListView**

Replace the stub in `LeftSidebarView.swift`:

```swift
case .sessions:
    SessionsListView(sidebarState: sidebarState)
```

- [ ] **Step 4: Add files to Xcode, build, and test**

Build and run. With `orbit` running, the sessions tab should populate after the API client connects. Expected: Sessions list shows, clicking highlights.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add sessions list view in left sidebar"
```

---

### Task 10: File Tree View

**Files:**

- Create: `macos/Sources/Features/Sidebar/LeftSidebar/FileTreeView.swift`
- Create: `macos/Sources/Features/Sidebar/LeftSidebar/FileTreeNodeView.swift`
- Modify: `macos/Sources/Features/Sidebar/LeftSidebar/LeftSidebarView.swift`
- Modify: `macos/Sources/Features/Sidebar/Shared/OrbitAPIClient.swift`

- [ ] **Step 1: Add file listing to OrbitAPIClient**

Add to `OrbitAPIClient.swift`:

```swift
struct FileNode: Codable, Identifiable {
    let id: String  // full path
    let name: String
    let isDirectory: Bool
    let children: [FileNode]?
}

func fetchFileTree(path: String) async throws -> [FileNode] {
    var components = URLComponents(url: baseURL.appendingPathComponent("/file/tree"), resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "path", value: path)]
    let (data, _) = try await session.data(from: components.url!)
    return try JSONDecoder().decode([FileNode].self, from: data)
}
```

- [ ] **Step 2: Write FileTreeNodeView**

```swift
import SwiftUI

struct FileTreeNodeView: View {
    let node: FileNode
    let depth: Int
    let onFileSelect: (String) -> Void
    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                if node.isDirectory {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10))
                        .frame(width: 12)
                } else {
                    Spacer().frame(width: 12)
                }

                Image(systemName: node.isDirectory ? "folder.fill" : "doc.text")
                    .font(.system(size: 12))
                    .foregroundStyle(node.isDirectory ? .yellow : .secondary)

                Text(node.name)
                    .font(.system(size: 13))
                    .lineLimit(1)

                Spacer()
            }
            .padding(.leading, CGFloat(depth) * 16)
            .padding(.vertical, 3)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
            .onTapGesture {
                if node.isDirectory {
                    isExpanded.toggle()
                } else {
                    onFileSelect(node.id)
                }
            }

            if isExpanded, let children = node.children {
                ForEach(children) { child in
                    FileTreeNodeView(
                        node: child,
                        depth: depth + 1,
                        onFileSelect: onFileSelect
                    )
                }
            }
        }
    }
}
```

- [ ] **Step 3: Write FileTreeView**

```swift
import SwiftUI

struct FileTreeView: View {
    @Bindable var sidebarState: SidebarState
    @State private var fileTree: [FileNode] = []
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(fileTree) { node in
                    FileTreeNodeView(node: node, depth: 0) { path in
                        Task {
                            if let content = try? await sidebarState.apiClient.readFile(path: path) {
                                sidebarState.showFilePreview(path: path, content: content)
                            }
                        }
                    }
                }
            }
            .padding(6)
        }
        .overlay {
            if isLoading {
                ProgressView()
            }
        }
        .task {
            if sidebarState.apiClient.isConnected {
                fileTree = (try? await sidebarState.apiClient.fetchFileTree(path: ".")) ?? []
                isLoading = false
            }
        }
    }
}
```

- [ ] **Step 4: Update LeftSidebarView**

Replace the stub in `LeftSidebarView.swift`:

```swift
case .files:
    FileTreeView(sidebarState: sidebarState)
```

- [ ] **Step 5: Add files to Xcode, build, and test**

Build and run. Expected: Files tab shows the project file tree. Clicking a file triggers the right sidebar (currently stub).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add file tree view in left sidebar with expand/collapse"
```

---

## Chunk 5: Right Sidebar — File Preview & Diffs

### Task 11: File Preview View

**Files:**

- Modify: `macos/Sources/Features/Sidebar/RightSidebar/FilePreviewView.swift`

- [ ] **Step 1: Write FilePreviewView with syntax highlighting**

```swift
import SwiftUI
import AppKit

struct FilePreviewView: View {
    let filePath: String
    let content: String

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            Text(content)
                .font(.system(size: 12, design: .monospaced))
                .textSelection(.enabled)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
```

Note: This is a minimal implementation. Syntax highlighting can be added later using a Swift library like `Splash` or `HighlightSwift`. The monospace font and text selection provide a usable code preview for v1.

- [ ] **Step 2: Wire into RightSidebarView**

Update `RightSidebarView.swift`:

```swift
if sidebarState.showDiff {
    DiffView(diff: sidebarState.diffContent ?? "")
} else {
    FilePreviewView(
        filePath: path,
        content: sidebarState.previewFileContent ?? ""
    )
}
```

- [ ] **Step 3: Build and test**

Click a file in the file tree. Expected: Right sidebar opens showing file content in monospace font.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add file preview view in right sidebar"
```

---

### Task 12: Diff View

**Files:**

- Modify: `macos/Sources/Features/Sidebar/RightSidebar/DiffView.swift`

- [ ] **Step 1: Write DiffView**

```swift
import SwiftUI

struct DiffView: View {
    let diff: String

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(diff.components(separatedBy: "\n").enumerated()), id: \.offset) { index, line in
                    HStack(spacing: 0) {
                        Text("\(index + 1)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .frame(width: 40, alignment: .trailing)
                            .padding(.trailing, 8)

                        Text(line)
                            .font(.system(size: 12, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 1)
                    .padding(.horizontal, 4)
                    .background(diffLineColor(line))
                }
            }
            .padding(4)
        }
    }

    private func diffLineColor(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") {
            return Color.green.opacity(0.15)
        } else if line.hasPrefix("-") && !line.hasPrefix("---") {
            return Color.red.opacity(0.15)
        } else if line.hasPrefix("@@") {
            return Color.blue.opacity(0.1)
        }
        return Color.clear
    }
}
```

- [ ] **Step 2: Build and test**

Build and run. The diff view will activate when `sidebarState.showDiff` is true. For now, test by manually setting diff content in SidebarState.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add unified diff view with green/red line highlighting"
```

---

## Chunk 6: Keyboard Shortcuts & Polish

### Task 13: Sidebar Toggle Keyboard Shortcuts

**Files:**

- Modify: `macos/Sources/Features/Terminal/TerminalView.swift`
- Modify: `macos/Sources/App/macOS/AppDelegate.swift` or `MainMenu.xib`

- [ ] **Step 1: Add keyboard shortcuts to TerminalView**

In `TerminalView.swift`, add keyboard handlers:

```swift
SidebarContainerView(sidebarState: sidebarState) {
    ZStack { /* existing */ }
}
.onAppear {
    sidebarState.connectToOrbit()
}
.keyboardShortcut("b", modifiers: [.command])  // Toggle left sidebar
// Note: May need to use NSEvent monitoring for shortcuts that
// don't conflict with terminal input. Evaluate during testing.
```

- [ ] **Step 2: Add menu items for sidebar toggles**

In `MainMenu.xib` or `AppDelegate.swift`, add menu items:

- View → Toggle Left Sidebar (Cmd+B)
- View → Toggle Right Sidebar (Cmd+Shift+B)

Wire to `sidebarState.toggleLeftSidebar()` / `sidebarState.toggleRightSidebar()`.

- [ ] **Step 3: Build and test shortcuts**

Expected: Cmd+B toggles left sidebar, Cmd+Shift+B toggles right sidebar.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add keyboard shortcuts for sidebar toggles"
```

---

### Task 14: SSE Event Handling for Real-Time Updates

**Files:**

- Modify: `macos/Sources/Features/Sidebar/Shared/OrbitAPIClient.swift`

- [ ] **Step 1: Add SSE event parsing**

Extend `OrbitAPIClient` with proper SSE parsing:

```swift
func startSSEStream() async {
    let url = baseURL.appendingPathComponent("/stream")
    var request = URLRequest(url: url)
    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

    do {
        let (bytes, _) = try await session.bytes(from: request)
        var eventBuffer = ""

        for try await line in bytes.lines {
            if line.isEmpty {
                // End of event — process buffer
                processSSEEvent(eventBuffer)
                eventBuffer = ""
            } else {
                eventBuffer += line + "\n"
            }
        }
    } catch {
        // Reconnect after delay
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        await startSSEStream()
    }
}

private func processSSEEvent(_ raw: String) {
    // Parse SSE format: "event: <type>\ndata: <json>\n"
    var eventType = ""
    var eventData = ""

    for line in raw.components(separatedBy: "\n") {
        if line.hasPrefix("event: ") {
            eventType = String(line.dropFirst(7))
        } else if line.hasPrefix("data: ") {
            eventData = String(line.dropFirst(6))
        }
    }

    Task { @MainActor in
        switch eventType {
        case "session.created", "session.updated", "session.deleted":
            try? await fetchSessions()
        case "file.changed":
            // Could trigger file tree refresh or diff update
            break
        default:
            break
        }
    }
}
```

- [ ] **Step 2: Start SSE stream in connectToOrbit**

Update `SidebarState.connectToOrbit()`:

```swift
func connectToOrbit() {
    Task {
        let connected = await apiClient.waitForServer()
        if connected {
            try? await apiClient.fetchSessions()
            await apiClient.startSSEStream()  // replaces connectSSE()
        }
    }
}
```

- [ ] **Step 3: Build and test**

Run the app, create a new session in the orbit TUI. Expected: Left sidebar sessions list updates automatically.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add SSE event stream for real-time sidebar updates"
```

---

### Task 15: Final Integration Test

- [ ] **Step 1: Full workflow test**

1. Build and launch Orbit Terminal
2. Verify: `orbit` CLI starts automatically in center terminal
3. Verify: Left sidebar shows after API connects (~2-3 seconds)
4. Verify: Sessions tab populates with current session
5. Verify: Files tab shows project file tree
6. Verify: Clicking a file opens right sidebar with file preview
7. Verify: Cmd+B toggles left sidebar
8. Verify: Cmd+Shift+B toggles right sidebar
9. Verify: Sidebars resize via drag handles
10. Verify: Creating a new session in TUI updates sidebar

- [ ] **Step 2: Fix any issues found**

Address bugs discovered during integration testing.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: orbit terminal v1 — ghostty fork with swiftui sidebars"
```

---

## Summary

| Chunk                     | Tasks | What It Delivers                                                           |
| ------------------------- | ----- | -------------------------------------------------------------------------- |
| 1: Fork & Rebrand         | 1-3   | Working Ghostty fork that auto-launches `orbit`, branded as Orbit Terminal |
| 2: Sidebar Infrastructure | 4-6   | Three-panel layout (left + terminal + right) with resize handles           |
| 3: IPC Layer              | 7-8   | HTTP+SSE client connecting SwiftUI to orbit's API server                   |
| 4: Left Sidebar           | 9-10  | Sessions list and file tree with real data                                 |
| 5: Right Sidebar          | 11-12 | File preview and diff view                                                 |
| 6: Polish                 | 13-15 | Keyboard shortcuts, SSE real-time updates, integration test                |

**API contract assumption:** The plan assumes OpenCode's HTTP server exposes `/session`, `/file/read`, `/file/tree`, and `/stream` (SSE) endpoints. The actual endpoint paths and response shapes should be verified against `Agent-backend/packages/opencode/src/server/routes/` before implementation. Create adapter types if response shapes differ.
