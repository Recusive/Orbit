# Snowflake DMG Build Guide

Guide for building, installing, and understanding the Snowflake macOS application.

## Quick Start

### Prerequisites

- macOS (Apple Silicon or Intel)
- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Rust (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Bun (`curl -fsSL https://bun.sh/install | bash`)

### Build the DMG

```bash
# Install dependencies
pnpm install

# Build sidecars (agent-bridge + Claude CLI)
pnpm build:sidecar

# Build the DMG
pnpm tauri build
```

Output: `target/release/bundle/dmg/Snowflake_0.1.0_aarch64.dmg`

## Installation

### From DMG

1. Double-click the `.dmg` file to mount it
2. Drag `Snowflake.app` to `/Applications`
3. Eject the DMG
4. Launch Snowflake from Applications

### Manual Installation

```bash
# Mount DMG
hdiutil attach target/release/bundle/dmg/Snowflake_0.1.0_aarch64.dmg

# Copy to Applications
cp -R "/Volumes/Snowflake/Snowflake.app" /Applications/

# Eject
hdiutil detach /Volumes/Snowflake
```

## Running with Logs

To see application logs for debugging:

```bash
/Applications/Snowflake.app/Contents/MacOS/snowflake-app
```

## Architecture

```
Snowflake.app/
└── Contents/
    └── MacOS/
        ├── snowflake-app      # Main Tauri app (13MB)
        ├── agent-bridge       # Node.js sidecar compiled with Bun (58MB)
        └── claude             # Official Claude CLI from Anthropic (158MB)
```

### How It Works

1. **snowflake-app** (Rust/Tauri)
   - Main application window
   - Spawns `agent-bridge` as a sidecar process
   - Communicates via stdin/stdout JSON IPC

2. **agent-bridge** (TypeScript/Bun)
   - Bridges Tauri backend with Claude Agent SDK
   - Manages chat sessions
   - Handles tool execution

3. **claude** (Official Anthropic Binary)
   - Claude Code CLI executable
   - Used by the Agent SDK for AI operations
   - Authenticates via OAuth (Claude Code Keychain)

### Communication Flow

```
┌─────────────────┐     IPC      ┌──────────────────┐    SDK     ┌─────────┐
│  Tauri (Rust)   │◄────────────►│  agent-bridge    │◄──────────►│  Claude │
│  snowflake-app  │  stdin/stdout│  (TypeScript)    │   spawn    │   CLI   │
└─────────────────┘              └──────────────────┘            └─────────┘
        ▲
        │ WebView
        ▼
┌─────────────────┐
│  React Frontend │
│  (TypeScript)   │
└─────────────────┘
```

## Build Scripts

### `pnpm build:sidecar`

Runs two tasks:

1. **Compile agent-bridge** with Bun:

   ```bash
   bun build --compile --minify --target=bun-darwin-arm64 \
     src/index.ts --outfile ../src-tauri/binaries/agent-bridge-aarch64-apple-darwin
   ```

2. **Download Claude CLI** from Anthropic's CDN:
   - Fetches latest stable version
   - Verifies SHA256 checksum
   - Saves to `src-tauri/binaries/claude-aarch64-apple-darwin`

### `pnpm tauri build`

1. Builds React frontend (`pnpm build:frontend`)
2. Compiles Rust backend
3. Bundles binaries from `src-tauri/binaries/`
4. Creates `.app` bundle and `.dmg` installer

## Troubleshooting

### "App is damaged" error

macOS Gatekeeper may block unsigned apps:

```bash
xattr -cr /Applications/Snowflake.app
```

### Claude CLI not found

Check the bundled binary exists:

```bash
ls -la /Applications/Snowflake.app/Contents/MacOS/claude
```

### Authentication issues

The app uses OAuth via Claude Code Keychain. Ensure you're logged into Claude Code:

```bash
claude auth login
```

### View logs

```bash
# Run with terminal output
/Applications/Snowflake.app/Contents/MacOS/snowflake-app 2>&1

# Or check system logs
log show --predicate 'process == "snowflake-app"' --last 5m
```

## File Locations

| File             | Location                                    |
| ---------------- | ------------------------------------------- |
| DMG output       | `target/release/bundle/dmg/`                |
| App bundle       | `target/release/bundle/macos/Snowflake.app` |
| Sidecar binaries | `src-tauri/binaries/`                       |
| Build script     | `agent-bridge/scripts/build-claude-cli.mjs` |
| Tauri config     | `src-tauri/tauri.conf.json`                 |

## Updating Claude CLI

The build script automatically downloads the latest stable version. To force re-download:

```bash
rm src-tauri/binaries/claude-*
pnpm build:sidecar
```
