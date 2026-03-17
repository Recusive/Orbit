# os

> **Path:** `Agent-backend/packages/desktop/src-tauri/src/os/`

## Purpose

OS-specific Rust code for platform abstractions. Contains `mod.rs` (module declarations and platform-conditional exports) and `windows.rs` (Windows-specific implementations).

## Usage Status

| Product             | Status      | Notes                                  |
| ------------------- | ----------- | -------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Platform abstraction patterns          |
| Orbit CLI           | `not used`  | CLI handles OS differences differently |
