# Release Guide

How to build, tag, and ship a new version of Orbit. Tested end-to-end on v0.0.3 → v0.0.4 (Feb 2026).

---

## Quick Release (TL;DR)

```bash
# 1. Bump version in both files
#    - package.json
#    - src-tauri/tauri.conf.json

# 2. Commit and push
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: bump version to v0.0.5"
git push origin main

# 3. Tag and push — this triggers the build
git tag -a v0.0.5 -m "v0.0.5"
git push origin v0.0.5

# 4. Wait ~15 min for CI, then verify
gh release view v0.0.5 --repo Recusive/Orbit-Release --json assets --jq '.assets[].name'
```

Expected output:

```
latest.json
Orbit_0.0.5_aarch64.dmg
Orbit_aarch64.app.tar.gz
Orbit_aarch64.app.tar.gz.sig
```

---

## Step-by-Step Guide

### 1. Bump the Version

Update the version string in **two files** (they must match):

| File                        | Field                |
| --------------------------- | -------------------- |
| `package.json`              | `"version": "x.y.z"` |
| `src-tauri/tauri.conf.json` | `"version": "x.y.z"` |

The version in `tauri.conf.json` is what gets baked into the binary and compared by the auto-updater.

### 2. Commit and Push to Main

```bash
git add package.json src-tauri/tauri.conf.json
git commit -m "chore: bump version to vX.Y.Z"
git push origin main
```

The pre-push hook runs typecheck + lint + tests. All must pass.

### 3. Create and Push the Tag

The tag triggers the CI release pipeline:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

The tag **must** start with `v` (e.g., `v0.0.5`). The workflow triggers on `push.tags: 'v*'`.

### 4. Monitor the Build

```bash
# Watch the run
gh run list --limit 3

# Get detailed status
gh run view <RUN_ID>

# View failure logs if something breaks
gh run view <RUN_ID> --log-failed | tail -50
```

The build takes ~15 minutes across 4 jobs:

| Job               | Time    | What it does                                                        |
| ----------------- | ------- | ------------------------------------------------------------------- |
| `create-release`  | ~10s    | Creates a draft GitHub Release on the private repo                  |
| `build-tauri`     | ~12 min | Compiles Rust, builds frontend, signs, notarizes, uploads artifacts |
| `publish-release` | ~5s     | Un-drafts the release                                               |
| `mirror-update`   | ~30s    | Copies artifacts to public `Orbit-Release` repo, rewrites URLs      |

### 5. Verify the Release

Check the public repo has all 4 artifacts:

```bash
gh release view vX.Y.Z --repo Recusive/Orbit-Release --json assets --jq '.assets[].name'
```

You should see:

- `latest.json` — update manifest (version, URL, signature)
- `Orbit_X.Y.Z_aarch64.dmg` — installer for fresh installs
- `Orbit_aarch64.app.tar.gz` — update bundle (downloaded by auto-updater)
- `Orbit_aarch64.app.tar.gz.sig` — Ed25519 signature for the update bundle

### 6. Verify Auto-Update (Optional)

If you have the **previous** version installed:

1. Open the old version of Orbit
2. It checks for updates 5 seconds after launch
3. A toast should appear: "Orbit vX.Y.Z available"
4. Click "Update now" → downloads → "Restart now" → relaunches on new version

Verify the installed version:

```bash
defaults read /Applications/Orbit.app/Contents/Info.plist CFBundleShortVersionString
```

---

## What the Pipeline Does

```
git push origin v0.0.5
        │
        ▼
┌─ create-release ────────────────────────────────────────┐
│  Creates a DRAFT release on Recusive/Orbit (private)    │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─ build-tauri (macOS 15 ARM64 runner) ───────────────────┐
│  1. bun install --frozen-lockfile                       │
│  2. Build agent-bridge sidecar (Bun compile)            │
│  3. Download Claude CLI binary                          │
│  4. tauri-apps/tauri-action@v0:                         │
│     - cargo build --release (Rust backend)              │
│     - vite build (React frontend)                       │
│     - Bundle into .app + .dmg                           │
│     - Apple codesign (Developer ID cert)                │
│     - Apple notarize (submit → wait → staple)           │
│     - Ed25519 sign .app.tar.gz → .sig                   │
│     - Generate latest.json                              │
│     - Upload all to draft release                       │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─ publish-release ───────────────────────────────────────┐
│  Un-drafts the release (now visible on private repo)    │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─ mirror-update ─────────────────────────────────────────┐
│  1. Download all assets from private release            │
│  2. Rewrite URLs in latest.json:                        │
│     Recusive/Orbit → Recusive/Orbit-Release             │
│  3. Create release on Recusive/Orbit-Release (public)   │
│                                                         │
│  Users never need access to the private repo.           │
│  The app fetches latest.json from the public repo.      │
└─────────────────────────────────────────────────────────┘
```

---

## Signing Keys

There are **two independent signing systems**:

### Apple Code Signing (Gatekeeper + Notarization)

Signs the `.app` and `.dmg` so macOS doesn't block them. Managed via Apple Developer Portal.

| Secret                       | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `APPLE_CERTIFICATE`          | Base64-encoded .p12 Developer ID cert                  |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12                                  |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: Pranit sharma (QSAMZF2NJ7)` |
| `APPLE_ID`                   | Apple ID email for notarization                        |
| `APPLE_PASSWORD`             | App-specific password for notarization                 |
| `APPLE_TEAM_ID`              | 10-char team identifier                                |

### Ed25519 Updater Signing (Tauri Auto-Update)

Signs the `.app.tar.gz` update bundle so the running app can verify it wasn't tampered with.

| Item         | Location                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| Private key  | GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY`                               |
| Password     | GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (currently: `build`) |
| Public key   | `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`                   |
| Local backup | `~/.tauri/orbit.key` (private), `~/.tauri/orbit.key.pub` (public)        |

**The pubkey is baked into the app binary.** If you regenerate the key, any previously installed version won't be able to verify updates signed with the new key. Users would need to manually install a DMG to get the new pubkey.

### Regenerating the Signing Key

Only do this if the key is compromised or lost:

```bash
# Generate new keypair (will ask for password)
bunx tauri signer generate -w ~/.tauri/orbit.key --force

# Update GitHub secrets
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/orbit.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body "your-password-here"

# Update pubkey in tauri.conf.json
cat ~/.tauri/orbit.key.pub
# Copy the base64 string into tauri.conf.json → plugins.updater.pubkey

# Commit and push
git add src-tauri/tauri.conf.json
git commit -m "fix: update updater signing pubkey"
git push origin main
```

**Important:** After regenerating, users on old versions must install the next release from the DMG (auto-update won't work because the old pubkey doesn't match).

---

## How Auto-Update Works (App Side)

1. `use-auto-update.ts` runs 5s after app launch, then every 4 hours
2. Calls `check()` from `@tauri-apps/plugin-updater`
3. Fetches `latest.json` from `Recusive/Orbit-Release/releases/latest/download/latest.json`
4. Compares `latest.json` version against the version baked into the binary
5. If newer → shows toast via `update-store.ts`
6. User clicks "Update now" → `downloadAndInstall()` downloads `.app.tar.gz`, verifies `.sig` against embedded pubkey, replaces binary
7. User clicks "Restart now" → `relaunch()` restarts the app

If the user clicks "Later", the toast is dismissed but a sidebar button appears offering the update.

Dev mode: `Cmd+Shift+U` triggers a simulated update flow for UI testing.

---

## Troubleshooting

### Build fails: "Wrong password for that key"

The `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret doesn't match the key's password. Re-set it:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body "your-password"
```

**Never use an empty password.** GitHub Secrets can't reliably store/pass empty strings.

### Build fails: "Signature not found for the updater JSON"

`createUpdaterArtifacts` is missing from `tauri.conf.json`. Add it:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
```

### latest.json missing from Orbit-Release

Check if the `mirror-update` job ran. It needs `RELEASE_REPO_TOKEN` (a fine-grained PAT with Contents: Read/Write on `Recusive/Orbit-Release`).

```bash
# Check the mirror job logs
gh run view <RUN_ID> --log | grep mirror
```

### App says "no update available"

1. Verify the installed version: `defaults read /Applications/Orbit.app/Contents/Info.plist CFBundleShortVersionString`
2. Check `latest.json` version: `gh release view latest --repo Recusive/Orbit-Release --json body`
3. The installed version must be **lower** than `latest.json` version (semver comparison)

### "Signature verification failed" on update

The pubkey in the installed app doesn't match the key that signed the update. This happens when the signing key was regenerated between versions. User must install the new version from the DMG.

### Tag already exists

```bash
# Delete local tag
git tag -d vX.Y.Z

# Delete remote tag
git push origin --delete vX.Y.Z

# Delete the draft release (if created)
gh release delete vX.Y.Z --yes

# Recreate
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

### Need to re-run a failed build

```bash
# Delete the failed release and tag
gh release delete vX.Y.Z --yes
git push origin --delete vX.Y.Z
git tag -d vX.Y.Z

# Fix the issue, commit, then re-tag
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

---

## Version History

| Version | Date     | Notes                                                                                                            |
| ------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| v0.0.1  | Feb 2026 | First build. Missing `createUpdaterArtifacts`, no `latest.json` generated.                                       |
| v0.0.2  | Feb 2026 | Added `createUpdaterArtifacts`. Failed: corrupted signing key, then wrong password. Never released successfully. |
| v0.0.3  | Feb 2026 | First successful end-to-end release. New signing key with password `build`.                                      |
| v0.0.4  | Feb 2026 | Auto-update test. Verified v0.0.3 → v0.0.4 update works end-to-end.                                              |

---

## Files Reference

| File                                           | Purpose                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `.github/workflows/tauri-build.yml`            | CI release pipeline (4 jobs)                                              |
| `src-tauri/tauri.conf.json`                    | App config: version, signing pubkey, updater endpoint                     |
| `package.json`                                 | Root workspace version (must match tauri.conf.json)                       |
| `apps/agent/src/hooks/core/use-auto-update.ts` | Auto-update check hook (5s delay, 4h interval)                            |
| `apps/agent/src/stores/ui/update-store.ts`     | Update state machine (idle → checking → available → downloading → ready)  |
| `scripts/build-with-env.sh`                    | Local build with .env signing credentials                                 |
| `docs/architecture/AUTO-UPDATE.md`             | Detailed architecture doc (signing, CI pipeline, frontend implementation) |
