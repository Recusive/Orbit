# Snowflake Development Guide

This document covers the development workflow, build system, and debugging tools for Snowflake.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## Development Modes

Snowflake supports three development modes with different logging levels:

| Mode      | Command          | Logs                               | Use Case          |
| --------- | ---------------- | ---------------------------------- | ----------------- |
| **Dev**   | `pnpm dev`       | Debug for snowflake, Info for deps | Daily development |
| **Debug** | `pnpm dev:debug` | Trace for everything               | Debugging issues  |
| **Quiet** | `pnpm dev:quiet` | Warnings only                      | Minimal noise     |

### Mode Details

#### Development Mode (Default)

```bash
pnpm dev
# or
make dev
```

- **Snowflake crates**: Debug level
- **Tauri**: Info level
- **tao/wry**: Warn level (hides noisy window events)
- Hot-reload enabled for both frontend and Rust

#### Debug Mode

```bash
pnpm dev:debug
# or
make debug
```

- **All crates**: Trace/Debug level
- Shows all window events, IPC messages, etc.
- Use when tracking down specific issues

#### Quiet Mode

```bash
pnpm dev:quiet
# or
make quiet
```

- **All crates**: Warn/Error only
- Minimal console output
- Good for demos or when output is distracting

### Web-Only Development

```bash
pnpm dev:web
# or
make web
```

- Runs only the Vite dev server on http://localhost:5176
- No Tauri/Rust backend
- Useful for pure UI development (backend features won't work)

## Build System

### Development Builds

```bash
pnpm dev           # Full app with hot-reload
pnpm dev:web       # Frontend only
```

### Production Builds

```bash
pnpm build         # Production app (.dmg/.exe/.AppImage)
pnpm build:debug   # Debug build (faster, with symbols)
```

Production builds output to:

- **macOS**: `src-tauri/target/release/bundle/dmg/` and `macos/`
- **Windows**: `src-tauri/target/release/bundle/msi/` and `nsis/`
- **Linux**: `src-tauri/target/release/bundle/appimage/` and `deb/`

### Rust-Only Builds

```bash
pnpm rust:build          # Debug build
pnpm rust:build:release  # Release build
pnpm rust:check          # Type check only (fastest)
```

## Quality Checks

### Quick Checks

```bash
pnpm check        # TypeScript + ESLint
pnpm check:rust   # Rust fmt + clippy + tests
pnpm check:all    # Everything
```

### Full CI Pipeline

```bash
pnpm ci
# or
make ci
```

Runs: TypeScript check → ESLint → Rust fmt → Clippy → Rust tests

### Auto-fix Issues

```bash
pnpm fix          # Fix TS + Rust formatting
pnpm lint:fix     # Fix ESLint only
pnpm rust:fmt:fix # Fix Rust formatting only
pnpm rust:lint:fix # Fix Clippy issues
```

### Tests

```bash
pnpm rust:test         # Run all Rust tests
pnpm rust:test:verbose # With output (--nocapture)
```

## Logging System

### Environment Variable

Set `SNOWFLAKE_LOG_MODE` to control logging:

```bash
SNOWFLAKE_LOG_MODE=dev pnpm tauri dev    # Development
SNOWFLAKE_LOG_MODE=debug pnpm tauri dev  # Verbose
SNOWFLAKE_LOG_MODE=prod pnpm tauri dev   # Minimal
```

### Log Levels by Mode

| Target      | Prod  | Dev   | Debug |
| ----------- | ----- | ----- | ----- |
| snowflake\* | Info  | Debug | Trace |
| tauri       | Warn  | Info  | Debug |
| tao         | Error | Warn  | Debug |
| wry         | Error | Warn  | Debug |
| Others      | Warn  | Info  | Debug |

### Production Log Files

Production builds write logs to:

- **macOS**: `~/Library/Logs/com.snowflake.app/`
- **Linux**: `~/.config/com.snowflake.app/logs/`
- **Windows**: `%APPDATA%\com.snowflake.app\logs\`

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

1. Start the app with `pnpm dev`
2. Press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux)
3. Or go to View → Toggle Developer Tools

### Rust Debugging

```bash
# Build with debug symbols
pnpm build:debug

# Use lldb (macOS) or gdb (Linux)
lldb target/debug/snowflake-app
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
      "program": "${workspaceFolder}/target/debug/snowflake-app"
    }
  ]
}
```

## Clean Up

```bash
pnpm clean        # Remove build artifacts
pnpm clean:rust   # Remove Rust target directory
make clean-deps   # Remove all deps and reinstall
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
pnpm install
cargo fetch
```

### Tauri not finding Vite server

The dev server must be running on port 5176. Check `vite.config.ts` and `src-tauri/tauri.conf.json`.

## Project Structure

```
Snowflake-v0/
├── src/                    # React frontend
├── src-tauri/              # Tauri app entry
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── lib.rs          # App setup + logging
│   │   └── commands/       # Tauri commands
│   └── tauri.conf.json     # Tauri config
├── crates/                 # Rust libraries
│   ├── snowflake-core/     # Core types
│   ├── snowflake-fs/       # File system
│   └── ...
├── package.json            # Node scripts
├── Cargo.toml              # Rust workspace
├── Makefile                # Make commands
└── DEVELOPMENT.md          # This file
```
