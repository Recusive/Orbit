# Orbit Terminal — Design Spec

> **Date:** 2026-03-10
> **Status:** Approved
> **Platform:** macOS (v1)

## Overview

Orbit Terminal is a standalone native macOS app that bundles a forked Ghostty terminal emulator with SwiftUI sidebars. The OpenCode CLI (rebranded as `orbit`) runs inside the terminal as the primary experience. The sidebars provide auxiliary context — session management, file tree, file preview, and diffs.

### Product Line Position

| Tier | Product                   | Technology               | Target User                                       |
| ---- | ------------------------- | ------------------------ | ------------------------------------------------- |
| 1    | `orbit` CLI               | Runs in any terminal     | Terminal power users                              |
| 2    | **Orbit Terminal** (this) | Forked Ghostty + SwiftUI | Developers who want a premium terminal experience |
| 3    | Orbit Editor              | Tauri + React IDE        | Developers who prefer GUI editors                 |

Same agent, three shells. The agent is the product — the UI is just the container.

### Core Philosophy

> "With agents doing most of the work, the UI does not matter. What matters is that the work is getting done."

The OpenCode TUI already handles chat, tool visualization, session management, and shell access. It runs beautifully in Ghostty's Metal GPU-accelerated renderer. The goal is to ship Ghostty as the guaranteed-premium container for the CLI, with native sidebars for auxiliary information.

## Architecture

```
┌─ Orbit Terminal.app (forked Ghostty, Swift/AppKit) ────────────────┐
│                                                                     │
│  ┌─────────────┬──────────────────────────┬─────────────────────┐  │
│  │  SwiftUI    │   libghostty (Metal GPU) │   SwiftUI           │  │
│  │  LEFT       │   Terminal Surface       │   RIGHT             │  │
│  │             │                          │                     │  │
│  │ ┌─────────┐ │   ┌──────────────────┐   │  ┌───────────────┐ │  │
│  │ │Sessions │ │   │                  │   │  │ File Preview  │ │  │
│  │ │Files    │ │   │  orbit CLI       │   │  │ (syntax hl)   │ │  │
│  │ │(tabbed) │ │   │  (OpenCode TUI)  │   │  │               │ │  │
│  │ │         │ │   │                  │   │  │ ── or ──      │ │  │
│  │ │ • list  │ │   │  Chat, tools,    │   │  │               │ │  │
│  │ │ • tree  │ │   │  shell, output   │   │  │ Diff View     │ │  │
│  │ │         │ │   │                  │   │  │ (green/red)   │ │  │
│  │ └─────────┘ │   └──────────────────┘   │  └───────────────┘ │  │
│  │  ◀ drag ▶  │                          │   ◀ drag ▶         │  │
│  └─────────────┴──────────────────────────┴─────────────────────┘  │
│                                                                     │
│  Communication: SwiftUI → localhost:4096 (HTTP+SSE)                 │
│  OpenCode TUI starts the server internally — single process         │
└─────────────────────────────────────────────────────────────────────┘
```

### Four Layers

| Layer           | Technology                             | Responsibility                                                         |
| --------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| App Shell       | Swift/AppKit (forked Ghostty `macos/`) | Window management, `NSSplitView` with 3 panes, menu bar, app lifecycle |
| Left Sidebar    | SwiftUI                                | Sessions list (tabbed), file tree (tabbed), collapsible                |
| Center Terminal | `libghostty` (untouched)               | GPU-rendered terminal surface running the OpenCode TUI                 |
| Right Sidebar   | SwiftUI                                | File preview with syntax highlighting, diff view, collapsible          |

### Process Model

Single process. The OpenCode TUI already starts an internal HTTP+SSE server on localhost:4096. The SwiftUI sidebars connect to this server. No second process needed.

## Ghostty Fork Scope

### What We Modify

| Area               | Change                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Main window layout | Replace single terminal view with `NSSplitView`: left sidebar + terminal + right sidebar       |
| App startup        | Auto-launch `orbit` CLI inside the terminal PTY on window open                                 |
| New SwiftUI views  | `SessionsSidebar.swift`, `FileTreeSidebar.swift`, `FilePreviewSidebar.swift`, `DiffView.swift` |
| IPC layer          | HTTP+SSE client in Swift, connects to OpenCode's server on localhost:4096                      |
| Branding           | App name → "Orbit Terminal", icon, menu bar text                                               |

### What We Don't Touch

- `libghostty` (Zig core) — completely untouched
- Terminal rendering — unchanged
- Keyboard/mouse handling in terminal — unchanged
- Ghostty's config system — inherited (fonts, themes, keybindings all work)

## App Lifecycle

```
1. User double-clicks Orbit Terminal.app
2. Swift/AppKit window opens with NSSplitView (left | terminal | right)
3. libghostty initializes Metal-accelerated terminal surface in center panel
4. Terminal auto-runs: orbit
5. OpenCode TUI renders in the terminal + internal HTTP+SSE server starts on :4096
6. SwiftUI sidebars connect to localhost:4096 via URLSession + EventSource
7. SSE subscriptions start — sidebars stay in sync with agent activity
8. User interacts with agent via the TUI (keyboard + mouse)
9. Sidebars update in real-time as sessions change, files are edited, etc.
```

## IPC: SwiftUI ↔ OpenCode

The OpenCode process already exposes a full HTTP+SSE API (Hono server, port 4096). SwiftUI sidebars consume this API directly.

| Sidebar       | API Endpoints           | Update Mechanism                                  |
| ------------- | ----------------------- | ------------------------------------------------- |
| Sessions list | `GET /session`          | SSE `session.created`, `session.updated` events   |
| File tree     | File listing endpoints  | SSE `file.changed` events or periodic poll        |
| File preview  | File read endpoints     | Triggered by click in file tree or SSE file event |
| Diff view     | Diff/snapshot endpoints | SSE `file.changed` after agent edits              |

## Left Sidebar Spec

Two tabs at the top: **Sessions** | **Files**

### Sessions Tab

- List of conversations from `GET /session`
- Each row: title, timestamp, model name
- Click to switch session (sends command to the TUI via the API)
- New session button at top
- Active session highlighted

### Files Tab

- File tree of the working directory
- Expandable folders, file icons
- Click a file → opens preview in right sidebar
- Files currently being edited by the agent get a visual indicator (dot/highlight)

## Right Sidebar Spec

Contextual — shows one of two views:

### File Preview (default on file click)

- Read-only code view with syntax highlighting
- Native `NSTextView` or lightweight syntax highlighting library
- Line numbers, monospace font matching Ghostty's terminal font

### Diff View (auto-switches when agent edits a file)

- Side-by-side or unified diff
- Green/red highlighting for additions/deletions
- Triggered by SSE events when the agent writes/edits files

### Both Sidebars

- Collapsible via drag handle or hotkey
- Resizable via drag
- When collapsed, terminal goes full-width (pure CLI experience)

## What We Build

| Component                | Tech                           | Description                                                   |
| ------------------------ | ------------------------------ | ------------------------------------------------------------- |
| Forked Ghostty macOS app | Swift/AppKit                   | Modify window layout to `NSSplitView` with 3 panes            |
| Left sidebar             | SwiftUI                        | Sessions list + file tree, tabbed, collapsible                |
| Right sidebar            | SwiftUI                        | File preview (syntax hl) + diff view, contextual, collapsible |
| IPC layer                | Swift URLSession + EventSource | HTTP+SSE client to localhost:4096                             |
| Auto-launch              | Swift PTY config               | Terminal auto-runs `orbit` on window open                     |
| Branding                 | Assets                         | App name, icon, menu bar                                      |

## What We Don't Build

- No chat UI — the TUI is the chat
- No custom terminal renderer — libghostty handles it
- No changes to libghostty — Zig core stays untouched
- No changes to OpenCode — the CLI/server works as-is
- No cross-platform for v1 (macOS only)

## Why Ghostty

- **GPU-accelerated rendering** (Metal on macOS) — the best-feeling terminal emulator available
- **Lightweight, embeddable** — `libghostty` is a clean C/Zig library
- **MIT-licensed** — legally straightforward to fork and rebrand
- **Native Swift/AppKit macOS app** — clean platform layer to extend
- **Full mouse protocol support** (SGR) — enables rich TUI interactions
- **Upstream mergeable** — our changes are additive (new panels, IPC), libghostty stays untouched

## Future Considerations

- **Linux support** — GTK platform layer (Ghostty already has this), GTK sidebars instead of SwiftUI
- **Windows support** — would need a new platform layer
- **Deeper TUI integration** — custom opentui components optimized for Ghostty's renderer
- **Shared settings** — sync Ghostty terminal config with Orbit preferences
