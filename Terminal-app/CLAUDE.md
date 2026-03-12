# CLAUDE.md - Orbit Terminal (Ghostty Fork)

> Native macOS terminal app. Ghostty fork with SwiftUI sidebar, IPC, and custom window chrome.
> Part of the three-tier product line: CLI (`orbit`) -> Orbit Terminal (this) -> Orbit Editor (Tauri IDE).

---

## Quick Reference

```bash
# Build & run (Xcode)
xcodebuild -project macos/OrbitTerminal.xcodeproj -scheme OrbitTerminal -configuration Debug build
open ~/Library/Developer/Xcode/DerivedData/OrbitTerminal-*/Build/Products/Debug/OrbitTerminal.app

# Build Ghostty core (Zig) — only needed when changing src/ or pkg/
zig build
zig build -Demit-macos-app=false   # Faster: skip macOS app bundle

# Tests
zig build test                              # Zig core tests
zig build test -Dtest-filter=SearchTests    # Targeted Zig test
# Swift tests run via Xcode Test navigator
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Orbit Terminal (macOS App)                              │
│                                                          │
│  ┌──────────┐  ┌──────────────────────────────────────┐ │
│  │ SwiftUI  │  │ Ghostty Core (libghostty)             │ │
│  │ Sidebar  │  │ GPU-accelerated Metal terminal        │ │
│  │          │  │ VT100 emulation, rendering, input     │ │
│  │ Tab list │  │ Compiled from Zig → xcframework       │ │
│  │ Git info │  │                                        │ │
│  │ Status   │  │ Sources: src/ + pkg/macos/            │ │
│  └──────────┘  └──────────────────────────────────────┘ │
│       ↕ SidebarTabManager observes NSWindow.tabGroup     │
│                                                          │
│  IPC: /tmp/orbit-terminal-{uid}.sock (JSON over Unix)   │
│  CLI: orbitctl tab.rename / tab.focus / ...              │
└─────────────────────────────────────────────────────────┘
```

**Two build systems:**

- **Zig** compiles Ghostty core -> `OrbitTerminalKit.xcframework` + `GhosttyKit.xcframework`
- **Xcode** assembles the macOS app from Swift sources + frameworks

---

## Project Structure

```
Terminal-app/
├── macos/                              # macOS app (Swift + Xcode)
│   ├── OrbitTerminal.xcodeproj/
│   ├── Sources/
│   │   ├── App/macOS/
│   │   │   ├── AppDelegate.swift       # Entry point, menus, event monitors
│   │   │   └── main.swift
│   │   ├── Features/
│   │   │   ├── Terminal/
│   │   │   │   ├── TerminalController.swift    # Window controller, sidebar setup
│   │   │   │   ├── TerminalView.swift          # Main terminal SwiftUI view
│   │   │   │   ├── Sidebar/
│   │   │   │   │   ├── SidebarView.swift       # SwiftUI sidebar + traffic lights
│   │   │   │   │   └── SidebarTabManager.swift # Tab state from NSWindow.tabGroup
│   │   │   │   ├── IPC/
│   │   │   │   │   ├── OrbitTerminalIPCServer.swift  # Unix socket server
│   │   │   │   │   └── TabMetadataStore.swift        # Per-tab metadata
│   │   │   │   ├── Window Styles/
│   │   │   │   │   ├── TerminalWindow.swift          # Base window (sidebar mode)
│   │   │   │   │   ├── HiddenTitlebarTerminalWindow.swift  # Reference: titlebar hiding
│   │   │   │   │   └── TitlebarTabs*.swift           # Ventura/Tahoe tab styles
│   │   │   │   └── Splits/                    # Split pane tree
│   │   │   ├── QuickTerminal/                 # Dropdown terminal (like Quake)
│   │   │   ├── Settings/                      # Preferences UI
│   │   │   ├── Update/                        # Sparkle auto-update
│   │   │   └── Command Palette/               # Fuzzy command search
│   │   ├── Helpers/
│   │   │   ├── Extensions/                    # 28+ NS*/OS extensions
│   │   │   └── Fullscreen.swift, MetalView.swift, etc.
│   │   └── OrbitTerminal/                     # Ghostty Swift bindings
│   │       ├── OrbitTerminal.App.swift        # Global state (89KB)
│   │       ├── OrbitTerminal.Config.swift     # Config parsing (39KB)
│   │       ├── OrbitTerminal.Input.swift      # Keyboard/mouse (45KB)
│   │       └── Surface View/                  # Metal rendering
│   └── Tests/                                 # XCTest + XCUITest
│
├── src/                                # Ghostty core (Zig) — DO NOT TOUCH casually
├── pkg/                                # Platform bindings (Zig)
├── cli/orbitctl                        # CLI tool for IPC
├── build.zig                           # Zig build config
└── Makefile                            # GLAD updates, clean
```

---

## Key Systems

### Sidebar (SwiftUI in AppKit)

The sidebar replaces native macOS tabs with a custom SwiftUI panel:

- **SidebarTabManager** (`@MainActor ObservableObject`) observes `NSWindow.tabGroup.windows`
- Refreshes on window focus changes, bell notifications, 100ms timer
- Each tab card shows: title, directory, git branch, status entries, color accent
- Drag-and-drop reordering via `DropDelegate`
- Custom traffic lights (close/minimize/zoom) since native titlebar is hidden

**Layout:** `NSSplitView` with sidebar (left) + terminal container (right), set as `window.contentView`.

### Window Chrome (Titlebar Hiding)

Sidebar mode hides the native titlebar while keeping rounded corners:

- `sidebarActive = true` set in `awakeFromNib` BEFORE accessories are added
- `.fullSizeContentView` applied in `awakeFromNib` (must happen before layout)
- `addTitlebarAccessoryViewController` override blocks ALL accessories when sidebar is active
- `NSTitlebarContainerView` hidden + frame zeroed in `configureSidebarTitlebar()`
- `contentLayoutRect` overridden to fill full window frame
- Custom SwiftUI `TrafficLightsView` provides close/minimize/zoom buttons

**Reference:** `HiddenTitlebarTerminalWindow.swift` — Ghostty's proven titlebar hiding approach.

### IPC Server (Unix Socket)

```
Socket: /tmp/orbit-terminal-{uid}.sock
Protocol: newline-delimited JSON
CLI: orbitctl <method> [params...]

Methods: tab.rename, tab.focus, tab.metadata, etc.
```

### Keyboard Shortcut: Cmd+S

Sidebar toggle intercepted in `AppDelegate.localEventKeyDown` (before Ghostty's `performKeyEquivalent`).

---

## Conventions

- **Swift style:** SwiftUI for sidebar/settings, AppKit for window management
- **Ghostty core:** Zig code in `src/` — treat as upstream, minimize changes
- **Window subclasses:** Each titlebar style has its own XIB + window subclass
- **Tab state:** `SidebarTabManager` is the source of truth for tab metadata
- **Config:** `~/.config/orbit-terminal/config.toml` (Ghostty format)
- **Frameworks:** Pre-built `.xcframework` bundles checked into `macos/`

---

## Common Tasks

### Adding a sidebar feature

1. Add state to `SidebarTabManager.TabItem`
2. Update `SidebarTabCard` in `SidebarView.swift`
3. If IPC-driven, add method to `OrbitTerminalIPCServer.swift`

### Modifying window chrome

1. Study `HiddenTitlebarTerminalWindow.swift` for patterns
2. Changes go in `TerminalWindow.swift` (base class) or dedicated subclass
3. Test: kill app -> build -> launch (titlebar state caches between runs)

### Adding a keyboard shortcut

1. Add to `AppDelegate.localEventKeyDown` for app-wide shortcuts
2. Or add `NSMenuItem` to the View menu in `applicationDidFinishLaunching`
3. Note: Ghostty's terminal surface intercepts Cmd+key via `performKeyEquivalent`

---

## Debugging

```bash
# Kill and rebuild
pkill -f OrbitTerminal; sleep 1
xcodebuild -project macos/OrbitTerminal.xcodeproj -scheme OrbitTerminal -configuration Debug build

# View hierarchy debugging (in Xcode)
# Debug -> View Debugging -> Capture View Hierarchy

# IPC testing
echo '{"method":"tab.rename","params":{"title":"Test"}}' | nc -U /tmp/orbit-terminal-$(id -u).sock
```

### Common Issues

| Issue                   | Cause                                | Fix                                                       |
| ----------------------- | ------------------------------------ | --------------------------------------------------------- |
| Titlebar reappears      | macOS re-shows on title changes      | `configureSidebarTitlebar()` re-applied in `title.didSet` |
| Accessories in titlebar | Added before `sidebarActive` set     | Must set `sidebarActive` at top of `awakeFromNib`         |
| Sidebar not visible     | `addSubview` vs `addArrangedSubview` | Use `addSubview` with explicit frames for NSSplitView     |
| Cmd+key not working     | Terminal surface consumes event      | Intercept in `AppDelegate.localEventKeyDown`              |
