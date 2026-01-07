# Orbit DMG Build Guide

Guide for building, installing, and understanding the Orbit macOS application.

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

Output: `target/release/bundle/dmg/Orbit_0.1.0_aarch64.dmg`

## Installation

### From DMG

1. Double-click the `.dmg` file to mount it
2. Drag `Orbit.app` to `/Applications`
3. Eject the DMG
4. Launch Orbit from Applications

### Manual Installation

```bash
# Mount DMG
hdiutil attach target/release/bundle/dmg/Orbit_0.1.0_aarch64.dmg

# Copy to Applications
cp -R "/Volumes/Orbit/Orbit.app" /Applications/

# Eject
hdiutil detach /Volumes/Orbit
```

## Running with Logs

To see application logs for debugging:

```bash
/Applications/Orbit.app/Contents/MacOS/orbit-app
```

## Architecture

```
Orbit.app/
└── Contents/
    └── MacOS/
        ├── orbit-app      # Main Tauri app (13MB)
        ├── agent-bridge       # Node.js sidecar compiled with Bun (58MB)
        └── claude             # Official Claude CLI from Anthropic (158MB)
```

### How It Works

1. **orbit-app** (Rust/Tauri)
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
│  orbit-app  │  stdin/stdout│  (TypeScript)    │   spawn    │   CLI   │
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

### "App is damaged" Error (macOS Gatekeeper)

When downloading the DMG from the internet (GitHub Actions, etc.), macOS adds a **quarantine flag** to mark it as untrusted. Since the app is not code-signed with an Apple Developer certificate, Gatekeeper blocks it with a misleading "damaged" error.

**The app is NOT actually damaged** — this is macOS protecting you from unsigned software.

#### Solution 1: Remove Quarantine (Recommended)

```bash
# 1. Remove any existing installation
rm -rf /Applications/Orbit.app

# 2. Mount the DMG
hdiutil attach ~/Desktop/Orbit_*.dmg

# 3. Copy to Applications
cp -R /Volumes/Orbit/Orbit.app /Applications/

# 4. Remove the quarantine flag (requires sudo)
sudo xattr -rd com.apple.quarantine /Applications/Orbit.app

# 5. Eject the DMG
hdiutil detach /Volumes/Orbit

# 6. Launch the app
open /Applications/Orbit.app
```

#### Solution 2: Right-Click → Open

1. Open Finder → Applications
2. **Right-click** (or Control-click) on Orbit.app
3. Select **Open** from the context menu
4. Click **Open** in the warning dialog

This bypasses Gatekeeper for the first launch only.

#### Solution 3: System Preferences

1. Try to open the app (it will fail)
2. Go to **System Preferences → Security & Privacy → General**
3. Click **Open Anyway** next to the Orbit message

#### Why `xattr -cr` Sometimes Fails

```bash
xattr -cr /Applications/Orbit.app
# Error: Operation not permitted
```

This happens because:

- The `-cr` flag tries to clear ALL extended attributes
- Some binaries have restricted permissions
- Use `-rd com.apple.quarantine` instead to target only the quarantine flag
- Use `sudo` to bypass permission restrictions

#### For Production Distribution

To avoid this issue for end users, the app needs:

1. **Code Signing** — Apple Developer certificate ($99/year)
2. **Notarization** — Submit to Apple for malware scanning
3. **Stapling** — Attach the notarization ticket to the DMG

This allows users to open the app normally without terminal commands.

### Claude CLI not found

Check the bundled binary exists:

```bash
ls -la /Applications/Orbit.app/Contents/MacOS/claude
```

### Authentication issues

The app uses OAuth via Claude Code Keychain. Ensure you're logged into Claude Code:

```bash
claude auth login
```

### View logs

```bash
# Run with terminal output
/Applications/Orbit.app/Contents/MacOS/orbit-app 2>&1

# Or check system logs
log show --predicate 'process == "orbit-app"' --last 5m
```

## File Locations

| File             | Location                                    |
| ---------------- | ------------------------------------------- |
| DMG output       | `target/release/bundle/dmg/`                |
| App bundle       | `target/release/bundle/macos/Orbit.app`     |
| Sidecar binaries | `src-tauri/binaries/`                       |
| Build script     | `agent-bridge/scripts/build-claude-cli.mjs` |
| Tauri config     | `src-tauri/tauri.conf.json`                 |

## Updating Claude CLI

The build script automatically downloads the latest stable version. To force re-download:

```bash
rm src-tauri/binaries/claude-*
pnpm build:sidecar
```
