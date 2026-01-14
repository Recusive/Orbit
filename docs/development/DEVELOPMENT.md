# Orbit Development Guide

This document covers the development workflow, build system, and debugging tools for Orbit.

> **Note:** This project uses Bun as the package manager (migrated from pnpm in January 2026).

## Quick Start

```bash
# Install dependencies
bun install

# Start development server
bunx tauri dev
```

## Development Modes

Orbit supports three development modes with different logging levels:

| Mode      | Command             | Logs                           | Use Case          |
| --------- | ------------------- | ------------------------------ | ----------------- |
| **Dev**   | `bun run dev`       | Debug for orbit, Info for deps | Daily development |
| **Debug** | `bun run dev:debug` | Trace for everything           | Debugging issues  |
| **Quiet** | `bun run dev:quiet` | Warnings only                  | Minimal noise     |

### Mode Details

#### Development Mode (Default)

```bash
bun run dev
# or
make dev
```

- **Orbit crates**: Debug level
- **Tauri**: Info level
- **tao/wry**: Warn level (hides noisy window events)
- Hot-reload enabled for both frontend and Rust

#### Debug Mode

```bash
bun run dev:debug
# or
make debug
```

- **All crates**: Trace/Debug level
- Shows all window events, IPC messages, etc.
- Use when tracking down specific issues

#### Quiet Mode

```bash
bun run dev:quiet
# or
make quiet
```

- **All crates**: Warn/Error only
- Minimal console output
- Good for demos or when output is distracting

### Web-Only Development

```bash
bun run dev:web
# or
make web
```

- Runs only the Vite dev server on http://localhost:5176
- No Tauri/Rust backend
- Useful for pure UI development (backend features won't work)

## Build System

### Development Builds

```bash
bun run dev        # Full app with hot-reload
bun run dev:web    # Frontend only
```

### Production Builds

```bash
bun run build         # Production app (.dmg/.exe/.AppImage)
bun run build:debug   # Debug build (faster, with symbols)
```

Production builds output to:

- **macOS**: `src-tauri/target/release/bundle/dmg/` and `macos/`
- **Windows**: `src-tauri/target/release/bundle/msi/` and `nsis/`
- **Linux**: `src-tauri/target/release/bundle/appimage/` and `deb/`

### Rust-Only Builds

```bash
bun run rust:build          # Debug build
bun run rust:build:release  # Release build
bun run rust:check          # Type check only (fastest)
```

## Quality Checks

### Quick Checks

```bash
bun run check        # TypeScript + ESLint + tests
bun run check:rust   # Rust fmt + clippy + tests
bun run check:all    # Everything
```

### Comprehensive Lint Script

```bash
./scripts/lint-all.sh              # Run all checks
./scripts/lint-all.sh --fix        # With auto-fix
./scripts/lint-all.sh --no-test    # Skip tests (faster)
./scripts/lint-all.sh --ts-only    # TypeScript/ESLint only
./scripts/lint-all.sh --rust-only  # Rust only
```

### Full CI Pipeline

```bash
bun run ci
# or
make ci
```

Runs: TypeScript check → ESLint → Canvas tests → Rust fmt → Clippy → Rust tests

### Auto-fix Issues

```bash
bun run fix          # Fix TS + Rust formatting
bun run lint:fix     # Fix ESLint only
bun run rust:fmt:fix # Fix Rust formatting only
bun run rust:lint:fix # Fix Clippy issues
```

### Tests

```bash
bun run rust:test         # Run all Rust tests
bun run rust:test:verbose # With output (--nocapture)
bun run canvas:test       # Run Canvas tests
```

## Logging System

### Environment Variable

Set `ORBIT_LOG_MODE` to control logging:

```bash
ORBIT_LOG_MODE=dev bunx tauri dev    # Development
ORBIT_LOG_MODE=debug bunx tauri dev  # Verbose
ORBIT_LOG_MODE=prod bunx tauri dev   # Minimal
```

### Log Levels by Mode

| Target  | Prod  | Dev   | Debug |
| ------- | ----- | ----- | ----- |
| orbit\* | Info  | Debug | Trace |
| tauri   | Warn  | Info  | Debug |
| tao     | Error | Warn  | Debug |
| wry     | Error | Warn  | Debug |
| Others  | Warn  | Info  | Debug |

### Production Log Files

Production builds write logs to:

- **macOS**: `~/Library/Logs/com.orbit.app/`
- **Linux**: `~/.config/com.orbit.app/logs/`
- **Windows**: `%APPDATA%\com.orbit.app\logs\`

### Adding Logs in Code

```rust
// In Rust
log::debug!("Processing file: {}", path);
log::info!("Server started on port {}", port);
log::warn!("Deprecated API used");
log::error!("Failed to read file: {}", err);
```

```typescript
// In TypeScript (console goes to DevTools, not terminal)
console.debug('Debug info');
console.info('Info message');
console.warn('Warning');
console.error('Error');
```

## Makefile Commands

For those who prefer Make:

```bash
make help      # Show all commands
make dev       # Start dev server
make debug     # Start with verbose logs
make quiet     # Start with minimal logs
make build     # Production build
make test      # Run tests
make lint      # Run all linters
make fix       # Auto-fix issues
make check     # Run all checks
make ci        # Full CI pipeline
make clean     # Clean build artifacts
make logs      # Show log file locations
make deps      # Show dependency tree
```

## Hot Reload

### Frontend (React/TypeScript)

- Changes to `src/` trigger instant HMR via Vite
- No restart needed
- State preserved when possible

### Backend (Rust)

- Changes to `src-tauri/` or `crates/` trigger recompilation
- App restarts automatically
- Takes a few seconds depending on changes

### No Hot Reload

- Changes to `Cargo.toml` require manual restart
- Changes to `tauri.conf.json` require manual restart

## Debugging

### Browser DevTools

1. Start the app with `bunx tauri dev`
2. Press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux)
3. Or go to View → Toggle Developer Tools

### Rust Debugging

```bash
# Build with debug symbols
bun run build:debug

# Use lldb (macOS) or gdb (Linux)
lldb target/debug/orbit-app
```

### VS Code Debugging

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Debug Tauri",
      "cargo": {
        "args": ["build", "--manifest-path=src-tauri/Cargo.toml"]
      },
      "program": "${workspaceFolder}/target/debug/orbit-app"
    }
  ]
}
```

## Clean Up

```bash
bun run clean        # Remove build artifacts
bun run clean:rust   # Remove Rust target directory
make clean-deps      # Remove all deps and reinstall
```

## Troubleshooting

### "Port 5176 already in use"

```bash
# Kill the process using the port
lsof -ti:5176 | xargs kill -9
```

### Rust compilation slow

```bash
# Use mold linker (Linux) or lld (macOS with LLVM)
# Already configured in .cargo/config.toml
```

### "Module not found" errors

```bash
bun install
cargo fetch
```

### Tauri not finding Vite server

The dev server must be running on port 5176. Check `vite.config.ts` and `src-tauri/tauri.conf.json`.

## Project Structure

```
Orbit-v0/
├── src/                    # React frontend
├── src-tauri/              # Tauri app entry
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── lib.rs          # App setup + logging
│   │   └── commands/       # Tauri commands
│   └── tauri.conf.json     # Tauri config
├── crates/                 # Rust libraries
│   ├── orbit-core/     # Core types
│   ├── orbit-fs/       # File system
│   └── ...
├── package.json            # Bun workspace
├── Cargo.toml              # Rust workspace
├── Makefile                # Make commands
└── DEVELOPMENT.md          # This file
```
