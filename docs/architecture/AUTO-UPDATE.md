# Auto-Update System

How Orbit delivers updates to users. Covers the full pipeline from version bump to user install.

---

## Architecture Overview

```
Private repo (Snowflake-v0)          Public repo (Orbit-Release)
┌──────────────────────────┐         ┌─────────────────────────┐
│  Source code              │         │  README + branding      │
│  CI workflow              │         │  Release artifacts:     │
│  GitHub Secrets           │         │   - Orbit_x.y.z.dmg    │
│                           │  mirror │   - Orbit.app.tar.gz   │
│  Draft release ──────────────────►  │   - latest.json        │
│  (private, auto-created)  │         │   - *.sig files        │
└──────────────────────────┘         └─────────────────────────┘
                                               │
                                               │ HTTPS fetch
                                               ▼
                                     ┌─────────────────────────┐
                                     │  Running Orbit app      │
                                     │  useAutoUpdate() hook   │
                                     │  Tauri updater plugin   │
                                     └─────────────────────────┘
```

**Why two repos?** The source repo is private. The Tauri updater needs a public URL to fetch `latest.json` and download artifacts. The public `Recusive/Orbit-Release` repo serves as a CDN — it only contains release artifacts, never source code.

---

## Repositories

| Repo          | Visibility | URL                                 | Purpose                          |
| ------------- | ---------- | ----------------------------------- | -------------------------------- |
| Snowflake-v0  | Private    | `github.com/Recusive/Snowflake-v0`  | Source code, CI pipeline         |
| Orbit-Release | Public     | `github.com/Recusive/Orbit-Release` | Release artifacts, `latest.json` |

The updater endpoint in `tauri.conf.json`:

```
https://github.com/Recusive/Orbit-Release/releases/latest/download/latest.json
```

---

## Signing Keys

Two independent signing systems are used:

### 1. Apple Code Signing (Gatekeeper)

Required so macOS doesn't block the app on first launch.

| What                             | Purpose                           |
| -------------------------------- | --------------------------------- |
| Developer ID Certificate         | Signs the `.app` bundle           |
| Apple ID + App-specific password | Submits to Apple for notarization |
| Team ID                          | Identifies the signing team       |

These are managed via Xcode / Apple Developer Portal and stored as GitHub Secrets.

### 2. Tauri Ed25519 Signing (Update Verification)

Required so the updater can verify that downloaded updates haven't been tampered with.

| What        | Location                                                      |
| ----------- | ------------------------------------------------------------- |
| Public key  | `tauri.conf.json` → `plugins.updater.pubkey` (base64 encoded) |
| Private key | GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY`                    |
| Password    | GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`           |

Generated with:

```bash
bunx tauri signer generate -w ~/.tauri/orbit.key
```

Local backup: `~/.tauri/orbit.key` (private) and `~/.tauri/orbit.key.pub` (public). Current password: `build`.

---

## GitHub Secrets

All secrets are on the **private** repo (Snowflake-v0):

| Secret                               | Purpose                                   | Source                             |
| ------------------------------------ | ----------------------------------------- | ---------------------------------- |
| `APPLE_CERTIFICATE`                  | Base64-encoded .p12 certificate           | Keychain Access → export           |
| `APPLE_CERTIFICATE_PASSWORD`         | Password for the .p12                     | Set during export                  |
| `APPLE_SIGNING_IDENTITY`             | `Developer ID Application: Name (TEAMID)` | Keychain Access                    |
| `APPLE_ID`                           | Apple ID email                            | Apple Developer account            |
| `APPLE_PASSWORD`                     | App-specific password                     | appleid.apple.com                  |
| `APPLE_TEAM_ID`                      | 10-char team identifier                   | Apple Developer portal             |
| `TAURI_SIGNING_PRIVATE_KEY`          | Ed25519 private key for update signing    | `bunx tauri signer generate`       |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the signing key              | Set during generation              |
| `RELEASE_REPO_TOKEN`                 | Fine-grained PAT for Orbit-Release        | GitHub Settings → Developer → PATs |
| `CENTRAL_LICENSE_KEY`                | License key (unrelated to updates)        | Pre-existing                       |

The `RELEASE_REPO_TOKEN` is a fine-grained Personal Access Token scoped to `Recusive/Orbit-Release` with **Contents: Read and write** permission. This allows the mirror job to create releases on the public repo.

---

## CI Pipeline

**Workflow file:** `.github/workflows/tauri-build.yml`

**Triggers:** Push a `v*` tag, or manual dispatch.

### Job 1: `create-release` (~10s, Ubuntu)

Creates a **draft** GitHub Release on the private repo. Draft = invisible until all builds pass.

### Job 2: `build-tauri` (~10-15 min, macOS 15 ARM64)

The heavy job. Runs on a GitHub-hosted Apple Silicon runner.

1. Checks out code
2. Installs Bun, Node 22, Rust stable (aarch64-apple-darwin target)
3. Selects Xcode 26.2 (latest SDK)
4. `bun install --frozen-lockfile`
5. `tauri-apps/tauri-action@v0` handles everything:
   - `cargo build --release` for the Rust backend
   - `bun run build` for the frontend
   - Packages into `.dmg` (installer) and `.app.tar.gz` (update bundle)
   - Code signs with Apple Developer ID certificate
   - Notarizes with Apple (sends binary, waits for approval, staples ticket)
   - Signs the `.app.tar.gz` with the Ed25519 key → produces `.app.tar.gz.sig`
   - Generates `latest.json` (version, download URL, signature, date)
   - Uploads all artifacts to the draft release

**Current targets:** macOS Apple Silicon (aarch64) only. Intel and Windows are commented out in the workflow.

### Job 3: `publish-release` (~5s, Ubuntu)

Un-drafts the release on the private repo, making it publicly visible (within the private repo).

### Job 4: `mirror-update` (~30s, Ubuntu)

Copies everything to the public repo:

1. `gh release download` — pulls all artifacts from the private release
2. `sed` — rewrites URLs in `latest.json` from `Snowflake-v0` → `Recusive/Orbit-Release`
3. `gh release create` — creates a release on `Recusive/Orbit-Release` with all files

After this job, the public `latest.json` URL is live and points to the public `.app.tar.gz`.

---

## Frontend Implementation

### Update Store (`apps/agent/src/stores/ui/update-store.ts`)

Zustand store with these states:

```
idle → checking → available → downloading → ready
                     ↓                         ↓
                   (Later)                   (Later)
                     ↓                         ↓
              toast dismissed           toast dismissed
              sidebar button            sidebar button
```

State shape:

```typescript
interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  availableVersion: string | null;
  releaseNotes: string | null;
  downloadProgress: number; // 0-100
  error: string | null;
  toastDismissed: boolean; // true after user clicks "Later"
}
```

Actions:

- `checkForUpdate()` — calls Tauri updater plugin `check()`
- `downloadAndInstall()` — downloads with progress tracking, then installs
- `relaunch()` — restarts the app on the new version
- `reset()` — returns to idle

### Auto-Update Hook (`apps/agent/src/hooks/core/use-auto-update.ts`)

- Mounted once in `App.tsx`
- On mount: 5-second delay, then `checkForUpdate()`
- Re-checks every 4 hours
- Only runs in production (Tauri environment), no-ops in browser dev mode

### Update Toast (`apps/agent/src/components/ui/update-toast.tsx`)

Rich card-style toast using `sonner` `toast.custom()`:

- Hero image with primary color overlay
- Title, description, progress bar (download state only)
- Action buttons: "Update now" / "Later" / "Restart now" / "Retry"
- Persistent toast ID (`'orbit-update'`) — only one toast at a time

Four exported functions:

- `showUpdateAvailable(version, onUpdate, onDismiss)`
- `showUpdateDownloading(progress)`
- `showUpdateReady(onRestart, onDismiss)`
- `showUpdateError(message, onRetry)`

### Sidebar Button (`apps/agent/src/components/layout/primary-sidebar/PrimarySidebar.tsx`)

After the user dismisses the toast with "Later", a sidebar button appears above Settings:

- Shows "Update available" or "Restart to update" depending on state
- Primary-colored badge ("Update" / "Restart")
- Dotted border to draw attention
- Clicking triggers `downloadAndInstall()` or `relaunch()`

Only visible when `(status === 'available' || status === 'ready') && toastDismissed`.

---

## Version Management

All version numbers must be synchronized across these files:

| File                                | Format               | Example              |
| ----------------------------------- | -------------------- | -------------------- |
| `package.json`                      | `"version": "x.y.z"` | `"version": "0.0.1"` |
| `src-tauri/tauri.conf.json`         | `"version": "x.y.z"` | `"version": "0.0.1"` |
| `Cargo.toml` (workspace)            | `version = "x.y.z"`  | `version = "0.0.1"`  |
| `agent-bridge/package.json`         | `"version": "x.y.z"` | `"version": "0.0.1"` |
| `crates/plugins/decorum/Cargo.toml` | `version = "x.y.z"`  | `version = "0.0.1"`  |

### Bump Script

```bash
./scripts/bump-version.sh 0.0.2
```

Updates the three main manifests (`package.json`, `Cargo.toml`, `tauri.conf.json`), stages, commits, and creates a `v0.0.2` git tag.

### Release Flow

```bash
# 1. Bump version across all manifests
./scripts/bump-version.sh 0.0.2

# 2. Push code and tag — triggers CI
git push && git push --tags

# 3. Wait for CI (~15 min)
# 4. Verify: check Orbit-Release has the new release
gh release list --repo Recusive/Orbit-Release
```

---

## Stress Testing

The update UI can be tested without a real update via DevTools:

```javascript
// Full simulation: available → downloading → ready
window.__orbit_debug.simulateUpdate();

// With error state
window.__orbit_debug.simulateUpdate({ showError: true });

// Quick visual cycle through all states
window.__orbit_debug.simulateUpdateQuickCycle();
```

Source: `apps/agent/src/stress-tests/update-simulation.ts`

---

## Configuration Reference

### tauri.conf.json (updater section)

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<base64 Ed25519 public key>",
      "endpoints": [
        "https://github.com/Recusive/Orbit-Release/releases/latest/download/latest.json"
      ],
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

### capabilities/default.json (permissions)

```json
"updater:default",
"process:allow-restart"
```

### CSP connect-src (tauri.conf.json)

```
https://github.com https://*.githubusercontent.com
```

Required for the updater to fetch `latest.json` and download artifacts from GitHub.

---

## Tauri Plugins

| Plugin  | Cargo Crate            | NPM Package                  | Purpose                          |
| ------- | ---------------------- | ---------------------------- | -------------------------------- |
| Updater | `tauri-plugin-updater` | `@tauri-apps/plugin-updater` | Check, download, install updates |
| Process | `tauri-plugin-process` | `@tauri-apps/plugin-process` | Restart app after update         |

---

## latest.json Format

Generated automatically by `tauri-apps/tauri-action`. Example:

```json
{
  "version": "0.0.2",
  "notes": "Orbit v0.0.2",
  "pub_date": "2026-02-18T12:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<Ed25519 signature>",
      "url": "https://github.com/Recusive/Orbit-Release/releases/download/v0.0.2/Orbit.app.tar.gz"
    }
  }
}
```

The Tauri updater:

1. Fetches this JSON
2. Compares `version` against local `tauri.conf.json` version
3. If newer, downloads the platform-specific `.tar.gz`
4. Verifies the `signature` against the public key
5. Extracts and replaces the app binary

---

## Troubleshooting

### Update check fails silently

The updater only works in production builds (`.dmg` / `.app`). In `bunx tauri dev`, the check runs but the plugin may not find a valid endpoint. Check console for `[UpdateStore]` log messages.

### "Signature verification failed"

The `.app.tar.gz.sig` was signed with a different key than the public key in `tauri.conf.json`. Regenerate keys and update both the secret and the config.

### Mirror job fails with 403

The `RELEASE_REPO_TOKEN` PAT may have expired or lacks write permission on `Recusive/Orbit-Release`. Regenerate in GitHub Settings → Developer → Fine-grained tokens.

### latest.json not found in release assets

The `tauri-apps/tauri-action` may have failed to generate it. Check the build-tauri job logs. Common cause: missing `TAURI_SIGNING_PRIVATE_KEY` secret.

### App says "no update available" but version is outdated

The version in `tauri.conf.json` must be lower than the version in `latest.json`. Verify both. The comparison is semver-based.

---

## Current Status

**Status:** Fully tested end-to-end. Auto-update verified on v0.0.3 → v0.0.4 (Feb 2026).

### Release History

| Version | Result                                                                                    |
| ------- | ----------------------------------------------------------------------------------------- |
| v0.0.1  | Built successfully but missing `createUpdaterArtifacts` — no `latest.json` generated      |
| v0.0.2  | Failed: corrupted signing key, then empty password issue with GitHub Secrets              |
| v0.0.3  | First successful full release (new key with password `build`)                             |
| v0.0.4  | Auto-update verified: v0.0.3 detected update, downloaded, installed, relaunched on v0.0.4 |

### Lessons Learned

- **Never use an empty password for the signing key.** GitHub Secrets can't reliably store/pass empty strings. Use a real password (current: `build`).
- **`createUpdaterArtifacts: true`** is required in `tauri.conf.json` for the updater to work. Without it, no `.app.tar.gz` or `.sig` is generated.
- **Regenerating the signing key breaks auto-update for existing installs.** The pubkey is baked into the binary. Users must manually install a new DMG to get the updated pubkey.

### Practical Guide

See `docs/development/RELEASE-GUIDE.md` for step-by-step release instructions.
