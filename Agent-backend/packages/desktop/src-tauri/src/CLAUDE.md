# src

> **Path:** `Agent-backend/packages/desktop/src-tauri/src/`

## Purpose

Rust source code for the Tauri v2 desktop backend. Contains the app entry point (`main.rs`), library root (`lib.rs`), CLI argument parsing (`cli.rs`), HTTP server (`server.rs`), window customization (`window_customizer.rs`), Windows-specific code (`windows.rs`), markdown rendering (`markdown.rs`), logging setup (`logging.rs`), constants (`constants.rs`), Linux display/windowing modules (`linux_display.rs`, `linux_windowing.rs`), and OS-specific code in `os/`.

## Usage Status

| Product             | Status      | Notes                             |
| ------------------- | ----------- | --------------------------------- |
| Orbit Desktop (SDK) | `reference` | Study Tauri Rust backend patterns |
| Orbit CLI           | `not used`  | CLI has its own backend           |
