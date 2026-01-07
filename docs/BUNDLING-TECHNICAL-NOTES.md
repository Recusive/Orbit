# Bundling Technical Notes

Internal documentation on how we solved the Claude CLI bundling challenge for Orbit.

## The Problem

We needed to bundle the Claude Agent SDK into a standalone macOS app, but:

1. **The Agent SDK spawns Claude CLI** - It doesn't make direct API calls; it runs the CLI as a subprocess
2. **Claude CLI is built with Bun** - Anthropic compiles it using `bun build --compile`
3. **yoga.wasm loading fails** - When bundled, the CLI couldn't find `yoga.wasm` (used by Ink for terminal UI)

### Error We Encountered

```
error: Cannot find module "./yoga.wasm" from "/$bunfs/root/bin"
```

This is a known Bun issue: [oven-sh/bun#6567](https://github.com/oven-sh/bun/issues/6567)

## Solutions We Tried

### Attempt 1: Patch yoga.wasm as Base64 (Worked but Fragile)

We patched the minified CLI source to embed yoga.wasm as base64:

```javascript
// Original (minified)
await idQ(ndQ(import.meta.url).resolve('./yoga.wasm'));

// Patched
Buffer.from('AGFzbQEAAAA...[base64]...', 'base64');
```

**Problems:**

- Pattern matching on minified code is fragile
- Breaks when Anthropic changes their bundler
- Not officially supported

### Attempt 2: Use Official Binary (Final Solution)

Download the official signed binary from Anthropic's CDN instead of patching.

**Benefits:**

- No fragile patching
- Signed and notarized by Anthropic
- Checksum verification
- Works with any Claude Code version

## Final Architecture

### Build Process

```
bun run build:sidecar
    │
    ├── bun build --compile agent-bridge
    │   └── Output: src-tauri/binaries/agent-bridge-aarch64-apple-darwin
    │
    └── node scripts/build-claude-cli.mjs
        ├── Fetch version from: .../claude-code-releases/stable
        ├── Fetch manifest from: .../claude-code-releases/{version}/manifest.json
        ├── Download binary from: .../claude-code-releases/{version}/darwin-arm64/claude
        ├── Verify SHA256 checksum
        └── Output: src-tauri/binaries/claude-aarch64-apple-darwin
```

### Claude CLI Distribution URLs

```
Base: https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases

Endpoints:
  /stable                           → Current stable version (e.g., "2.0.67")
  /{version}/manifest.json          → Checksums for all platforms
  /{version}/{platform}/claude      → Binary for specific platform

Platforms:
  darwin-arm64    → macOS Apple Silicon
  darwin-x64      → macOS Intel
  linux-arm64     → Linux ARM
  linux-x64       → Linux x86_64
  win32-x64       → Windows
```

### Manifest Format

```json
{
  "version": "2.0.67",
  "buildDate": "2025-12-11T23:58:21Z",
  "platforms": {
    "darwin-arm64": {
      "checksum": "4b5709f0b799650445da3df46025f600f6ddcc65f2c9857d2c83eb986c343ff0",
      "size": 165511888
    }
  }
}
```

## Tauri Configuration

### External Binaries (`tauri.conf.json`)

```json
{
  "bundle": {
    "externalBin": ["binaries/agent-bridge", "binaries/claude"]
  }
}
```

Tauri automatically:

- Appends target triple (e.g., `-aarch64-apple-darwin`)
- Copies binaries to `Contents/MacOS/` in the app bundle
- Strips the target triple in production (just `agent-bridge`, `claude`)

### macOS Entitlements (`Entitlements.plist`)

Required for spawning subprocesses:

```xml
<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
<true/>
<key>com.apple.security.cs.disable-library-validation</key>
<true/>
<key>com.apple.security.inherit</key>
<true/>
```

## Rust Sidecar Spawning

### Path Resolution (`src-tauri/src/lib.rs`)

```rust
fn resolve_sidecar_path() -> PathBuf {
    // Production: bundled next to executable
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Tauri strips target triple in production
            let prod_path = exe_dir.join("agent-bridge");
            if prod_path.exists() {
                return prod_path;
            }
        }
    }

    // Development: src-tauri/binaries/
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("agent-bridge-aarch64-apple-darwin")
}
```

### Claude CLI Path (`src-tauri/src/agent/bridge.rs`)

```rust
// Derive claude binary path from sidecar path
let sidecar_dir = Path::new(sidecar_path).parent();
let claude_path = format!("{}/claude", sidecar_dir);

// Pass to agent-bridge via environment variable
Command::new(sidecar_path)
    .env("CLAUDE_CLI_PATH", &claude_path)
    .spawn()
```

### Agent Bridge Usage (`agent-bridge/src/agent.ts`)

```typescript
private _findClaudeExecutable(): string | undefined {
    const envClaudePath = process.env.CLAUDE_CLI_PATH;
    if (envClaudePath && existsSync(envClaudePath)) {
        return envClaudePath;
    }
    // Fall back to SDK's built-in executable
    return undefined;
}

// Pass to SDK
new Claude({
    pathToClaudeCodeExecutable: this._findClaudeExecutable(),
})
```

## Bundle Sizes

| Component            | Size     | Notes                     |
| -------------------- | -------- | ------------------------- |
| orbit-app            | 13MB     | Tauri main binary         |
| agent-bridge         | 58MB     | Bun-compiled sidecar      |
| claude               | 158MB    | Official Anthropic binary |
| **DMG (compressed)** | **76MB** | Final distributable       |

## Key Files

| File                                        | Purpose                                     |
| ------------------------------------------- | ------------------------------------------- |
| `agent-bridge/scripts/build-claude-cli.mjs` | Downloads official Claude CLI               |
| `agent-bridge/src/agent.ts`                 | SDK integration, finds Claude executable    |
| `agent-bridge/src/index.ts`                 | Bridge entry point, PATH setup              |
| `src-tauri/src/lib.rs`                      | Sidecar path resolution                     |
| `src-tauri/src/agent/bridge.rs`             | Spawns agent-bridge, passes CLAUDE_CLI_PATH |
| `src-tauri/tauri.conf.json`                 | externalBin configuration                   |
| `src-tauri/Entitlements.plist`              | macOS subprocess permissions                |

## Why This Works

1. **Official binary** - Anthropic already solved the yoga.wasm problem in their build
2. **Signed & notarized** - No Gatekeeper issues
3. **Checksum verification** - Ensures integrity
4. **Caching** - Skips download if binary matches checksum
5. **Environment variable** - Clean way to tell SDK where to find CLI

## Potential Issues

### If Anthropic changes CDN URLs

Update `DIST_BASE` in `build-claude-cli.mjs`:

```javascript
const DIST_BASE = 'https://storage.googleapis.com/claude-code-dist-.../claude-code-releases';
```

### If manifest format changes

Update checksum field access:

```javascript
const expectedHash = manifest.platforms[platform]?.checksum;
```

### Cross-platform builds

Currently downloads for current platform only. For CI/CD, add:

```javascript
// Download all platforms
for (const platform of Object.keys(PLATFORMS)) {
  await downloadClaudeCli(platform, version, manifest);
}
```

## References

- [Bun WASM Issue #6567](https://github.com/oven-sh/bun/issues/6567)
- [yoga-wasm-web](https://github.com/shuding/yoga-wasm-web)
- [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [Tauri External Binaries](https://tauri.app/v1/guides/building/sidecar/)
- [Claude Code Installation](https://claude.ai/install.sh)
