# packages/desktop

> **Path:** `Agent-backend/packages/desktop/`

## Purpose

Tauri v2 desktop application wrapping the OpenCode web UI (`packages/app`). Bundles the `opencode` CLI as a sidecar, provides native OS integrations (clipboard, dialogs, notifications, deep links, auto-updates, window state persistence), and includes a Rust backend for server management, CLI proxying, and platform-specific window customization.

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                                                                                        |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Orbit already has its own Tauri setup. This package is a reference for: sidecar bundling pattern, CLI-to-server bridge (`server.rs`), native menu integration, deep link handling, auto-updater, and platform-specific window customization. |
| Orbit CLI           | `not used`  | CLI is standalone                                                                                                                                                                                                                            |

## Recommendation

**KEEP AS REFERENCE** — Orbit already has its own Tauri app, but this shows how upstream solved the same problems (sidecar lifecycle, native platform abstraction, auto-updater, window customization, deep links). The Rust backend (`server.rs`, `window_customizer.rs`) is particularly relevant since Orbit's `src-tauri/` faces the same challenges.

## When to Reference This

| If you're building...                                          | Read this file                                 | What you'll learn                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Sidecar process management** (spawn/restart/kill CLI binary) | `src/cli.ts` + `src-tauri/src/server.rs`       | Sidecar lifecycle: spawn with args, health check polling, graceful shutdown, restart on crash                             |
| **Native Platform abstraction** (Tauri replacing web APIs)     | `src/entry.tsx`                                | Which web APIs need Tauri overrides: clipboard, notifications, file dialogs, `openLink`, back/forward navigation, restart |
| **Auto-update system**                                         | `src/updater.ts`                               | `@tauri-apps/plugin-updater` integration, update check flow, user notification                                            |
| **Window chrome per-OS** (vibrancy, titlebar)                  | `src-tauri/src/window_customizer.rs`           | macOS vibrancy, Windows mica, Linux GTK titlebar, transparent backgrounds                                                 |
| **Deep link protocol** (`opencode://`)                         | `src-tauri/tauri.conf.json` + deep-link plugin | Protocol registration, URL parsing, routing to correct session                                                            |
| **Native menu bar**                                            | `src/menu.ts`                                  | File/Edit/View/Window menus with Tauri menu API                                                                           |
| **Loading screen** while sidecar starts                        | `src/loading.tsx`                              | Splash screen pattern before server is ready                                                                              |
| **Tauri v2 capabilities/permissions**                          | `src-tauri/capabilities/`                      | How to define ACL permissions for Tauri plugins                                                                           |
| **Multi-channel app icons** (dev/beta/prod)                    | `src-tauri/icons/`                             | Icon sets per release channel with platform variants (.icns, .ico, .png)                                                  |
| **Linux display server detection**                             | `src-tauri/src/linux_display.rs`               | Wayland vs X11 detection and windowing differences                                                                        |

## Key Files

### Frontend (`src/`)

| File              | Purpose                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `entry.tsx`       | Tauri entry point — creates `Platform` with native APIs (Tauri clipboard, dialog, notifications, opener, shell, updater) |
| `index.tsx`       | Root component — renders `AppInterface` with Tauri server connection                                                     |
| `cli.ts`          | CLI sidecar management — spawn/manage the bundled opencode binary                                                        |
| `bindings.ts`     | TypeScript bindings for Tauri Rust commands                                                                              |
| `menu.ts`         | Native menu bar integration                                                                                              |
| `updater.ts`      | Auto-update system via `@tauri-apps/plugin-updater`                                                                      |
| `loading.tsx`     | Loading screen while sidecar starts                                                                                      |
| `webview-zoom.ts` | Zoom level management                                                                                                    |
| `styles.css`      | Desktop-specific styles                                                                                                  |
| `i18n/`           | Desktop-specific i18n overrides                                                                                          |

### Rust Backend (`src-tauri/src/`)

| File                                      | Purpose                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| `lib.rs` + `main.rs`                      | Tauri app entry, plugin registration                 |
| `server.rs`                               | Manages the opencode server sidecar process          |
| `cli.rs`                                  | CLI command proxying from desktop to sidecar         |
| `window_customizer.rs`                    | Platform-specific window chrome (titlebar, vibrancy) |
| `windows.rs`                              | Windows-specific adaptations                         |
| `linux_display.rs` + `linux_windowing.rs` | Linux display server detection and windowing         |
| `logging.rs`                              | Structured logging for Rust side                     |
| `markdown.rs`                             | Markdown processing                                  |
| `constants.rs`                            | App constants                                        |
| `os/`                                     | OS-specific utilities                                |

### Config & Build

| File                        | Purpose                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| `src-tauri/tauri.conf.json` | Tauri config — capabilities, permissions, sidecar definitions             |
| `src-tauri/capabilities/`   | Tauri v2 capability definitions                                           |
| `src-tauri/icons/`          | App icons per channel: `dev/`, `beta/`, `prod/` (macOS + Linux + Windows) |
| `scripts/predev.ts`         | Pre-development setup script                                              |
| `vite.config.ts`            | Vite config for desktop frontend                                          |

## Tauri Plugins Used

`clipboard-manager`, `deep-link`, `dialog`, `http`, `notification`, `opener`, `os`, `process`, `shell`, `store`, `updater`, `window-state`

## Dependencies

- **Internal:** `@orbit.build/app` (web UI), `@orbit.build/ui` (components)
- **Tauri:** `@tauri-apps/api` + 12 Tauri plugins
- **Frontend:** `solid-js`, `@solidjs/meta`

## Notes

- **Sidecar pattern** — the desktop app bundles the `opencode` CLI binary and spawns it as a subprocess. `server.rs` manages the sidecar lifecycle. This is the same pattern Orbit already uses (agent-bridge sidecar).
- **Three icon channels** — `dev/`, `beta/`, `prod/` in `src-tauri/icons/` with platform variants (macOS .icns, Windows .ico, Linux .png, Android mipmaps). Orbit has a similar multi-channel icon system.
- **`entry.tsx` creates a Tauri `Platform`** — overrides `notify`, `openLink`, `back`, `forward`, `restart` with native Tauri implementations (vs web's `window.open` / `history.back`).
