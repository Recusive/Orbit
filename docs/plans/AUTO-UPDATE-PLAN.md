# Auto-Update System for Orbit

## Overview

Add production auto-updates using `tauri-plugin-updater` with GitHub Releases as the update server. Users see a non-intrusive banner when an update is available and choose when to install.

---

## Phase 1: Rust Backend — Plugin Setup

### 1a. Add dependencies

**`Cargo.toml` (workspace root, line ~20)** — add to `[workspace.dependencies]`:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

**`src-tauri/Cargo.toml` (line ~69, after `tauri-plugin-window-state`)** — add:

```toml
tauri-plugin-updater = { workspace = true }
tauri-plugin-process = { workspace = true }
```

### 1b. Register plugins in `src-tauri/src/lib.rs`

Add after `.plugin(tauri_plugin_window_state::Builder::new().build())` (line 290):

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

### 1c. Configure updater in `src-tauri/tauri.conf.json`

Replace `"plugins": {}` (line 68) with:

```json
"plugins": {
  "updater": {
    "pubkey": "PLACEHOLDER_UNTIL_KEYS_GENERATED",
    "endpoints": [
      "https://github.com/Recursive/Orbit/releases/latest/download/latest.json"
    ],
    "windows": {
      "installMode": "passive"
    }
  }
}
```

### 1d. Update CSP `connect-src` (line 39)

Add GitHub domains for update downloads:

```
https://github.com https://*.githubusercontent.com
```

### 1e. Add ACL permissions — `src-tauri/capabilities/default.json`

Add to the permissions array:

```json
"updater:default",
"process:allow-restart"
```

---

## Phase 2: Frontend — NPM Packages

**`package.json`** — add to `dependencies`:

```json
"@tauri-apps/plugin-updater": "^2",
"@tauri-apps/plugin-process": "^2"
```

Then `bun install`.

---

## Phase 3: Frontend — Zustand Store

### New file: `apps/agent/src/stores/ui/update-store.ts`

State machine with these states:

- `idle` → `checking` → `available` → `downloading` → `ready`
- Any state → `error`

**State shape:**

```typescript
interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  availableVersion: string | null;
  releaseNotes: string | null;
  downloadProgress: number; // 0–100
  error: string | null;
  dismissed: boolean;
}
```

**Actions:**

- `checkForUpdate()` — calls `check()` from `@tauri-apps/plugin-updater`
- `downloadAndInstall()` — calls `update.downloadAndInstall()` with progress tracking via `onEvent`
- `relaunch()` — calls `relaunch()` from `@tauri-apps/plugin-process`
- `dismiss()` — hides banner until next check cycle
- `reset()` — returns to idle

**Export** from `apps/agent/src/stores/ui/index.ts`.

---

## Phase 4: Frontend — Auto-Check Hook

### New file: `apps/agent/src/hooks/core/use-auto-update.ts`

- On mount: delay 5 seconds, then call `checkForUpdate()`
- Set interval: re-check every 4 hours
- Cleanup on unmount
- Mount once in `App.tsx` inside `<TauriProvider>`

---

## Phase 5: Frontend — Update Banner Component

### New file: `apps/agent/src/components/layout/update-banner.tsx`

A slim banner rendered **above the StatusBar** in `App.tsx` (between the mode content div and `<StatusBar />`).

**Renders based on store status:**

| Status                          | UI                                                            |
| ------------------------------- | ------------------------------------------------------------- |
| `available`                     | "Orbit vX.Y.Z available" + **Update now** / **Later** buttons |
| `downloading`                   | Progress bar (Radix Progress) + percentage                    |
| `ready`                         | "Restart to apply update" + **Restart now** button            |
| `error`                         | Error message + **Retry** button                              |
| `idle`, `checking`, `dismissed` | Nothing rendered                                              |

Uses:

- `@/components/ui/button`
- Radix `@radix-ui/react-progress` (already in deps) — need to create `components/ui/progress.tsx` wrapper
- `lucide-react` icons: `Download`, `RefreshCw`, `X`
- `motion` for enter/exit animation (< 300ms, respect `prefers-reduced-motion`)

### New file: `apps/agent/src/components/ui/progress.tsx`

Standard shadcn-style wrapper around `@radix-ui/react-progress`.

---

## Phase 6: App.tsx Integration

In `App.tsx` (line ~258, between mode content and StatusBar):

```tsx
<UpdateBanner />
```

Add `useAutoUpdate()` hook call inside the `App` component.

---

## Phase 7: Signing Keys

Generate Tauri updater keypair (one-time setup):

```bash
bunx tauri signer generate -w ~/.tauri/orbit-updater.key
```

This produces:

- **Private key** → store as `TAURI_SIGNING_PRIVATE_KEY` GitHub Secret
- **Password** → store as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Secret
- **Public key** → paste into `tauri.conf.json` `plugins.updater.pubkey`

> These are **Ed25519 keys** for update verification — completely separate from Apple code signing certificates.

---

## Phase 8: GitHub Actions — Update Workflow

**Modify `.github/workflows/tauri-build.yml`** to use `tauri-apps/tauri-action@v0`:

Key changes:

1. Replace manual `bunx tauri build` with `tauri-apps/tauri-action`
2. Pass `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` env vars
3. Pass Apple code signing env vars for macOS
4. The action automatically:
   - Signs update bundles (`.tar.gz` / `.nsis.zip`)
   - Generates `latest.json` manifest
   - Uploads everything to the GitHub Release (including `.sig` files)

Structure: `create-release` job → `build-tauri` matrix job (macOS ARM64, macOS x86_64, Windows) → `publish-release` job to un-draft.

---

## Phase 9: Version Unification

Currently scattered:

- `src-tauri/tauri.conf.json`: `0.1.0`
- `Cargo.toml` workspace: `0.0.1`
- `package.json`: `0.0.1`

**Action:** Align all to `0.1.0`. Create `scripts/bump-version.sh` that updates all three files and creates a git tag.

---

## Files to Create

| File                                                 | Purpose                  |
| ---------------------------------------------------- | ------------------------ |
| `apps/agent/src/stores/ui/update-store.ts`           | Update state management  |
| `apps/agent/src/hooks/core/use-auto-update.ts`       | Periodic update checking |
| `apps/agent/src/components/layout/update-banner.tsx` | Update notification UI   |
| `apps/agent/src/components/ui/progress.tsx`          | Radix Progress wrapper   |
| `scripts/bump-version.sh`                            | Version sync script      |

## Files to Modify

| File                                  | Change                                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| `Cargo.toml`                          | Add `tauri-plugin-updater` + `tauri-plugin-process` to workspace deps |
| `src-tauri/Cargo.toml`                | Add both plugins to dependencies                                      |
| `src-tauri/src/lib.rs`                | Register both plugins (2 lines)                                       |
| `src-tauri/tauri.conf.json`           | Add updater config, update CSP                                        |
| `src-tauri/capabilities/default.json` | Add updater + process permissions                                     |
| `package.json`                        | Add `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process`       |
| `apps/agent/src/stores/ui/index.ts`   | Export update store                                                   |
| `apps/agent/src/App.tsx`              | Mount `useAutoUpdate` + `<UpdateBanner />`                            |
| `.github/workflows/tauri-build.yml`   | Switch to `tauri-apps/tauri-action` with signing                      |

---

## Verification

1. **Compile check:** `cargo check` passes with new plugins
2. **TypeScript check:** `bun run typecheck` passes
3. **Lint:** `bun run lint` passes
4. **Local test:** Run `bunx tauri dev`, verify the update check runs (will show "no update" in logs since we're running dev)
5. **Full pipeline test:** Tag `v0.1.1`, push, verify GitHub Actions creates a release with `latest.json` and `.sig` files
6. **End-to-end:** Install `v0.1.0` build, release `v0.1.1`, verify the installed app detects and installs the update
