# Orbit CLI Distribution — v0.0.1

## Context

Orbit CLI is a standalone AI coding agent (OpenCode fork) at `Agent-backend/packages/opencode/`. The binary already runs as `orbit` (`scriptName("orbit")` in index.ts). We need a public install path so users can run:

```bash
curl -fsSL https://orbit.build/install | bash
```

This plan covers the minimum needed for a v0.0.1 CLI release: an install script, build script rebranding, installation module updates, and a GitHub Actions workflow that mirrors binaries to `Recusive/Orbit-Release`.

**Deferred to post-v0.0.1:** npm publishing, Homebrew tap, AUR/Scoop/Chocolatey, Docker, Windows binaries, musl/baseline variants, `OPENCODE_*` → `ORBIT_*` global rename (209 occurrences, 50 files — internal constants, not user-facing).

---

## Phase 1: Install Script

**Create:** `Agent-backend/packages/opencode/install` (shell script, no extension)

Fork the reference at `reference/opencode-reference/install` (447 lines) with these changes:

| Line(s) | Original                                       | Change To                                    |
| ------- | ---------------------------------------------- | -------------------------------------------- |
| 3       | `APP=opencode`                                 | `APP=orbit`                                  |
| 12      | `OpenCode Installer`                           | `Orbit CLI Installer`                        |
| 23-25   | `opencode.ai/install` examples                 | `orbit.build/install` examples               |
| 68      | `INSTALL_DIR=$HOME/.opencode/bin`              | `INSTALL_DIR=$HOME/.orbit/bin`               |
| 104     | Supported combos include `windows-x64`         | Remove windows for v0.0.1                    |
| 154     | `filename="$APP-$target$archive_ext"`          | Already uses `$APP`, works with `orbit`      |
| 170-171 | `github.com/anomalyco/opencode`                | `github.com/Recusive/Orbit-Release`          |
| 180-184 | `github.com/anomalyco/opencode`                | `github.com/Recusive/Orbit-Release`          |
| 187     | `github.com/anomalyco/opencode/releases`       | `github.com/Recusive/Orbit-Release/releases` |
| 208-212 | `command -v opencode`, `which opencode`        | `command -v orbit`, `which orbit`            |
| 264     | `opencode_install_$$`                          | `orbit_install_$$`                           |
| 314-315 | `Installing opencode`, `opencode_install_$$`   | `Installing orbit`, `orbit_install_$$`       |
| 329-330 | `mv "$tmp_dir/opencode"`, `chmod ... opencode` | `mv "$tmp_dir/orbit"`, `chmod ... orbit`     |
| 335-336 | `Installing opencode from`, `cp ... opencode`  | `Installing orbit from`, `cp ... orbit`      |
| 355     | `# opencode` comment in shell config           | `# orbit`                                    |
| 357     | `opencode` in success message                  | `orbit`                                      |
| 433-446 | OpenCode ASCII art + "opencode.ai/docs"        | Orbit branding + `orbit.build/docs`          |

The script's core logic (platform detection, Rosetta check, musl/baseline detection, progress bar, shell PATH management, `--binary` flag, `VERSION` pinning) stays identical.

**Tag pattern for releases:** The install script uses `cli-v*` tags:

- Latest: `github.com/Recusive/Orbit-Release/releases/latest/download/` won't work if desktop releases are also "latest". Instead, use the GitHub API filtered by `cli-v` tag prefix, OR use a dedicated `cli-latest` tag that gets overwritten on each release.

**Decision: Use `cli-latest` tag** — The install script downloads from:

```
https://github.com/Recusive/Orbit-Release/releases/download/cli-latest/$filename
```

The CI workflow creates/overwrites a `cli-latest` release in addition to the versioned `cli-v0.0.1` release. This is the simplest approach — no API calls needed in the install script.

For version-pinned installs (`--version 0.0.1`), use:

```
https://github.com/Recusive/Orbit-Release/releases/download/cli-v0.0.1/$filename
```

---

## Phase 2: Build Script Rebranding

**Modify:** `Agent-backend/packages/opencode/script/build.ts`

| Line | Current                                   | Change To                              |
| ---- | ----------------------------------------- | -------------------------------------- |
| 152  | `pkg.name` in name array (= `"opencode"`) | `"orbit"`                              |
| 184  | `name.replace(pkg.name, "bun")`           | `name.replace("orbit", "bun")`         |
| 185  | `dist/${name}/bin/opencode`               | `dist/${name}/bin/orbit`               |
| 186  | `--user-agent=opencode/${Script.version}` | `--user-agent=orbit/${Script.version}` |

**Do NOT change:**

- `OPENCODE_*` defines (lines 191-196) — internal, deferred
- `pkg.name` in package.json — workspace resolution depends on it
- `Script.version` / `Script.channel` / `Script.release` logic

After this, `bun run script/build.ts --single` will output `dist/orbit-darwin-arm64/bin/orbit`.

---

## Phase 3: Installation Module Update

**Modify:** `Agent-backend/packages/opencode/src/installation/index.ts`

| Line    | Current                                                   | Change To                                                     |
| ------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| 36      | `https://opencode.ai/install`                             | `https://orbit.build/install`                                 |
| 127     | `brew list --formula opencode`                            | `brew list --formula orbit`                                   |
| 131     | `scoop list opencode`                                     | `scoop list orbit`                                            |
| 135     | `choco list --limit-output opencode`                      | `choco list --limit-output orbit`                             |
| 150     | `"opencode"` / `"opencode-ai"`                            | `"orbit"` / `"orbit-ai"`                                      |
| 167-171 | `anomalyco/tap/opencode` references                       | `recusive/tap/orbit`                                          |
| 183     | `opencode-ai@${target}` (npm)                             | `orbit-ai@${target}`                                          |
| 186     | `opencode-ai@${target}` (pnpm)                            | `orbit-ai@${target}`                                          |
| 189     | `opencode-ai@${target}` (bun)                             | `orbit-ai@${target}`                                          |
| 198     | `brew tap anomalyco/tap`                                  | `brew tap recusive/tap`                                       |
| 203     | `brew --repo anomalyco/tap`                               | `brew --repo recusive/tap`                                    |
| 222     | `choco upgrade opencode`                                  | `choco upgrade orbit`                                         |
| 225     | `scoop install opencode@`                                 | `scoop install orbit@`                                        |
| 228     | `opencode-ai@${target}` (yarn)                            | `orbit-ai@${target}`                                          |
| 250     | `USER_AGENT = "opencode/..."`                             | `USER_AGENT = "orbit/..."`                                    |
| 284     | `formulae.brew.sh/.../opencode.json`                      | `formulae.brew.sh/.../orbit.json`                             |
| 303     | `${registry}/opencode-ai/`                                | `${registry}/orbit-ai/`                                       |
| 316     | chocolatey query for `opencode`                           | query for `orbit`                                             |
| 331     | `ScoopInstaller/.../opencode.json`                        | `ScoopInstaller/.../orbit.json`                               |
| 344     | `api.github.com/repos/anomalyco/opencode/releases/latest` | `api.github.com/repos/Recusive/Orbit-Release/releases/latest` |

---

## Phase 4: Uninstall Command Update

**Modify:** `Agent-backend/packages/opencode/src/cli/cmd/uninstall.ts`

Lines 140-148 — display strings:

```
opencode-ai → orbit-ai  (npm, pnpm, bun, yarn)
opencode → orbit         (brew, choco, scoop)
```

Lines 191-199 — execution commands:

```
Same changes as above
```

Line 205 — choco special case: `"opencode"` → `"orbit"`

---

## Phase 5: GitHub Actions Workflow

**Create:** `.github/workflows/cli-release.yml`

Follows the same 4-stage pattern as `tauri-build.yml`:

```
Stage 1: create-release     — Create draft release on source repo (tag: cli-v*)
Stage 2: build-cli           — Build CLI binaries (4 platforms on macos-15)
Stage 3: publish-release     — Un-draft the release
Stage 4: mirror-cli          — Mirror to Recusive/Orbit-Release + create/update cli-latest
```

**Trigger:** `push: tags: ['cli-v*']` + `workflow_dispatch`

**Stage 2 detail** (single job on `macos-15`):

- Checkout, setup-bun, setup-node
- `bun install` in Agent-backend
- Set env: `OPENCODE_VERSION=<ver>`, `OPENCODE_CHANNEL=latest`
- Run `bun run script/build.ts` (builds all targets via cross-compilation)
- Archive only 4 targets:
  - `orbit-darwin-arm64.zip`
  - `orbit-darwin-x64.zip`
  - `orbit-linux-arm64.tar.gz`
  - `orbit-linux-x64.tar.gz`
- Upload to draft release

**Stage 4 detail** (mirror):

- Download assets from source repo release
- Create versioned release: `cli-v0.0.1` on Orbit-Release
- Delete and recreate `cli-latest` release on Orbit-Release with same assets
- Uses `RELEASE_REPO_TOKEN` secret (already configured for desktop mirroring)

---

## Phase 6: Website Route (External)

**Not in this repo** — needs to be done on orbit.build website.

Add a route at `orbit.build/install` that serves the install script as `text/plain`. Options:

1. **Proxy from GitHub**: fetch `raw.githubusercontent.com/Recusive/Snowflake-v0/main/Agent-backend/packages/opencode/install` (always in sync)
2. **Static file**: copy the script to the website repo

Recommend option 1 for v0.0.1 — zero maintenance.

---

## Files to Modify/Create

| Action     | File                                                        |
| ---------- | ----------------------------------------------------------- |
| **Create** | `Agent-backend/packages/opencode/install`                   |
| **Create** | `.github/workflows/cli-release.yml`                         |
| **Modify** | `Agent-backend/packages/opencode/script/build.ts`           |
| **Modify** | `Agent-backend/packages/opencode/src/installation/index.ts` |
| **Modify** | `Agent-backend/packages/opencode/src/cli/cmd/uninstall.ts`  |

---

## Verification

1. **Local build**: `cd Agent-backend/packages/opencode && OPENCODE_VERSION=0.0.1 OPENCODE_CHANNEL=latest bun run script/build.ts --single` → verify `dist/orbit-darwin-arm64/bin/orbit` exists
2. **Binary runs**: `./dist/orbit-darwin-arm64/bin/orbit --version` → prints `0.0.1`
3. **Install script local test**: `bash Agent-backend/packages/opencode/install --binary ./dist/orbit-darwin-arm64/bin/orbit` → binary at `~/.orbit/bin/orbit`, PATH added to `.zshrc`
4. **CI dry run**: Push `cli-v0.0.1-test` tag, verify workflow creates release and mirrors to Orbit-Release
5. **End-to-end**: After release + website route, `curl -fsSL https://orbit.build/install | bash` installs orbit, `orbit --version` outputs `0.0.1`
