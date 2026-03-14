# CLAUDE.md - Orbit Terminal (Ghostty Fork)

> Native macOS terminal app built on Ghostty. GPU-accelerated Metal rendering, Zig core, Swift/AppKit shell.
> Part of the three-tier product line: CLI (`orbit`) -> Orbit Terminal (this) -> Orbit Editor (Tauri IDE).

---

## Quick Reference

```bash
# Debug build & run (Xcode only — fast iteration)
cd Terminal-app
xcodebuild -project macos/OrbitTerminal.xcodeproj -scheme OrbitTerminal -configuration Debug build
open ~/Library/Developer/Xcode/DerivedData/OrbitTerminal-*/Build/Products/Debug/OrbitTerminal.app

# Production build (Zig + Xcode — full app, no debug banner)
cd Terminal-app
zig build -Doptimize=ReleaseFast -Demit-macos-app=true
open zig-out/OrbitTerminal.app

# Zig core only (no macOS app bundle)
zig build
zig build -Demit-macos-app=false   # Faster: skip app bundle

# Tests
zig build test                              # Zig core tests
zig build test -Dtest-filter=SearchTests    # Targeted Zig test
# Swift tests: run via Xcode Test navigator

# Clean everything
rm -rf zig-out .zig-cache macos/build
```

---

## Two Build Systems

| Build              | Command                                                  | Output                                    | Use                                  |
| ------------------ | -------------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| **Xcode Debug**    | `xcodebuild ... -configuration Debug`                    | `DerivedData/.../Debug/OrbitTerminal.app` | Fast iteration, has debug banner     |
| **Zig Production** | `zig build -Doptimize=ReleaseFast -Demit-macos-app=true` | `zig-out/OrbitTerminal.app`               | Full production app, no debug banner |

The Zig build invokes `xcodebuild` internally (see `src/build/GhosttyXcodebuild.zig`). It builds to `macos/build/ReleaseLocal/`, then copies to `zig-out/`. The Xcode configuration used depends on the Zig optimize flag:

- `Debug` → Xcode `Debug`
- `ReleaseFast/ReleaseSmall/ReleaseSafe` → Xcode `ReleaseLocal`

**Production build requires `po/` locale files.** These were removed during cleanup. Restore with: `git checkout 93f953dd -- Terminal-app/po/`

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Orbit Terminal (macOS App)                              │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Ghostty Core (libghostty)                           │ │
│  │ GPU-accelerated Metal terminal rendering            │ │
│  │ VT100 emulation, input handling, config             │ │
│  │ Compiled from Zig → OrbitTerminalKit.xcframework    │ │
│  │ Sources: src/ + pkg/macos/                          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Swift/AppKit Shell                                  │ │
│  │ Window management, tabs, splits, settings, menus    │ │
│  │ Sources: macos/Sources/                             │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

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
│   │   │   │   ├── TerminalController.swift    # Window controller
│   │   │   │   ├── TerminalView.swift          # Main terminal SwiftUI view
│   │   │   │   ├── Window Styles/
│   │   │   │   │   ├── TerminalWindow.swift              # Base window class
│   │   │   │   │   ├── HiddenTitlebarTerminalWindow.swift # Hidden titlebar style
│   │   │   │   │   ├── TransparentTitlebarTerminalWindow.swift
│   │   │   │   │   └── TitlebarTabs*.swift               # Ventura/Tahoe tab styles
│   │   │   │   └── Splits/                    # Split pane tree
│   │   │   ├── QuickTerminal/                 # Dropdown terminal (like Quake)
│   │   │   ├── Settings/                      # Preferences UI
│   │   │   ├── Update/                        # Sparkle auto-update
│   │   │   ├── Custom App Icon/               # Dynamic icon compositing + DockTilePlugin
│   │   │   └── Command Palette/               # Fuzzy command search
│   │   ├── Helpers/
│   │   │   ├── Extensions/                    # 28+ NS*/OS extensions
│   │   │   └── Fullscreen.swift, MetalView.swift, etc.
│   │   └── OrbitTerminal/                     # Ghostty Swift bindings
│   │       ├── OrbitTerminal.App.swift        # Global state (89KB)
│   │       ├── OrbitTerminal.Config.swift     # Config parsing (39KB)
│   │       ├── OrbitTerminal.Input.swift      # Keyboard/mouse (45KB)
│   │       └── Surface View/                  # Metal rendering
│   ├── Tests/                                 # XCTest + XCUITest
│   └── Assets.xcassets/                       # Asset catalog (icons, colors)
│
├── images/
│   ├── OrbitTerminal.icon/             # Icon Composer project (macOS 26 Liquid Glass)
│   │   ├── icon.json                   # Layer definitions (compositing recipe)
│   │   └── Assets/                     # Layer PNGs (ghost, screen, bevel, gloss)
│   └── icons/                          # Flat icon PNGs (16-2048px, used by Zig build)
│
├── src/                                # Ghostty core (Zig) — treat as upstream
├── pkg/                                # Platform bindings (Zig)
├── build.zig                           # Zig build config
├── build.zig.zon                       # Zig dependencies
└── Makefile                            # GLAD updates, clean
```

---

## App Icon System (3 layers)

The icon has three independent pipelines — all must be updated to change the app icon:

| Layer             | Source                                             | Used By                                        |
| ----------------- | -------------------------------------------------- | ---------------------------------------------- |
| **Icon Composer** | `images/OrbitTerminal.icon/` (icon.json + Assets/) | macOS 26 Liquid Glass icon (primary on Tahoe)  |
| **Flat PNGs**     | `images/icons/icon_*.png` (12 files, 16-2048px)    | Zig build fallback, pre-Tahoe .icns generation |
| **Asset Catalog** | `macos/Assets.xcassets/AppIconImage.imageset/`     | In-app display (settings, about, error views)  |

**DockTilePlugin** (`macos/Sources/Features/Custom App Icon/DockTilePlugin.swift`) overrides the Dock icon at runtime:

- macOS 26+ non-DEBUG: reads icon from `NSWorkspace`, falls back to `AppIconImage` from plugin bundle
- macOS 26+ DEBUG: uses `BlueprintImage` from `Alternate Icons/`
- Pre-Tahoe: uses `AppIconImage` directly, calls `NSWorkspace.shared.setIcon()` to persist

**To change the icon:** Replace assets in all three locations, clean all build dirs (`rm -rf zig-out .zig-cache macos/build`), and `killall Dock` to clear runtime cache.

---

## Window Styles

Each titlebar style has its own XIB file + NSWindow subclass:

| Style          | XIB                               | Window Class                        | Notes                                                        |
| -------------- | --------------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Native         | `Terminal.xib`                    | `TerminalWindow`                    | Standard titlebar + native tabs                              |
| Hidden         | `TerminalHiddenTitlebar.xib`      | `HiddenTitlebarTerminalWindow`      | No titlebar, no traffic lights, `.tabbingMode = .disallowed` |
| Transparent    | `TerminalTransparentTitlebar.xib` | `TransparentTitlebarTerminalWindow` | Transparent titlebar area                                    |
| Tabs (Ventura) | `TerminalTabsTitlebarVentura.xib` | `TitlebarTabsVenturaTerminalWindow` | Tabs in titlebar                                             |
| Tabs (Tahoe)   | `TerminalTabsTitlebarTahoe.xib`   | `TitlebarTabsTahoeTerminalWindow`   | macOS 26+ tabs                                               |

Selected in `TerminalController.windowNibName` based on `config.macosTitlebarStyle`.

**Key pattern for titlebar hiding** (from `HiddenTitlebarTerminalWindow`):

- Keep `.titled` in style mask (rounded corners)
- Add `.fullSizeContentView` (content extends behind titlebar)
- Hide `standardWindowButton`s + `NSTitlebarContainerView`
- Override `contentLayoutRect` to fill full window frame
- Re-apply in `title.didSet` (macOS 15+ re-reveals on title change)

---

## Conventions

- **Ghostty core:** Zig code in `src/` — treat as upstream, minimize changes
- **Swift shell:** `macos/Sources/` — where customization happens
- **Config:** `~/.config/orbit-terminal/config.toml` (Ghostty format)
- **Frameworks:** Pre-built `.xcframework` bundles in `macos/`
- **Keyboard shortcuts:** Ghostty's terminal surface intercepts Cmd+key via `performKeyEquivalent` before the menu system — use `AppDelegate.localEventKeyDown` (NSEvent local monitor) to intercept first

---

## Debugging

```bash
# Kill and rebuild (debug)
pkill -f OrbitTerminal; sleep 1
cd Terminal-app
xcodebuild -project macos/OrbitTerminal.xcodeproj -scheme OrbitTerminal -configuration Debug build
open ~/Library/Developer/Xcode/DerivedData/OrbitTerminal-*/Build/Products/Debug/OrbitTerminal.app

# View hierarchy debugging (in Xcode)
# Debug -> View Debugging -> Capture View Hierarchy
```

### Common Issues

| Issue                                   | Cause                                                           | Fix                                                                            |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Debug banner showing                    | libghostty xcframework compiled in debug mode                   | Use `zig build -Doptimize=ReleaseFast` for production                          |
| Release build crash (Sparkle)           | Code signing mismatch on Sparkle.framework                      | Build with `ENABLE_HARDENED_RUNTIME=NO` or re-sign framework                   |
| Zig build fails "po/\*.po FileNotFound" | Locale files removed during cleanup                             | `git checkout 93f953dd -- Terminal-app/po/`                                    |
| Icon not changing                       | 3 icon pipelines + DockTilePlugin runtime override + Dock cache | Replace all 3 sources, `rm -rf zig-out .zig-cache macos/build`, `killall Dock` |
| Cmd+key not working                     | Terminal surface consumes event                                 | Intercept in `AppDelegate.localEventKeyDown`                                   |
